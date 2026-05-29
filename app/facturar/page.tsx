"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";
import Swal from "sweetalert2";
import {
  ArrowLeft,
  Banknote,
  Barcode,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Trash2,
  X,
} from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  hasFirebaseConfig,
} from "@/lib/firebase";
import { currency, Product, ProductForm } from "@/lib/products";

type CartItem = Pick<
  Product,
  "id" | "barcode" | "name" | "price" | "cost" | "stock"
> & {
  quantity: number;
};

type PaymentMethod = "cash" | "transfer" | "mixed";

const maxProductsPerSale = 10;
const cameraConstraints: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

function showScanToast(productName: string) {
  void Swal.fire({
    toast: true,
    position: "top",
    icon: "success",
    title: `${productName} agregado`,
    showConfirmButton: false,
    timer: 850,
    timerProgressBar: true,
    background: "#071b2f",
    color: "#e0f2fe",
  });
}

export default function BillingPage() {
  const router = useRouter();
  const firebaseReady = hasFirebaseConfig();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef("");
  const cartRef = useRef<CartItem[]>([]);
  const totalQuantityRef = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(firebaseReady);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [cashReceived, setCashReceived] = useState(0);
  const [transferAmount, setTransferAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [saleCompleted, setSaleCompleted] = useState(false);

  const sessionError = firebaseReady
    ? ""
    : "Configura las variables de Firebase para usar facturacion.";

  const totalQuantity = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const totalCost = useMemo(
    () => cart.reduce((sum, item) => sum + item.cost * item.quantity, 0),
    [cart]
  );

  const profit = total - totalCost;
  const cashDue =
    paymentMethod === "mixed" ? Math.max(total - transferAmount, 0) : total;
  const change =
    paymentMethod === "transfer" ? 0 : Math.max(cashReceived - cashDue, 0);

  useEffect(() => {
    cartRef.current = cart;
    totalQuantityRef.current = totalQuantity;
  }, [cart, totalQuantity]);

  useEffect(() => {
    if (!firebaseReady) {
      return;
    }

    const firebaseAuth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      if (!currentUser) {
        router.replace("/");
        return;
      }

      setUser(currentUser);
      setCheckingSession(false);
      setScannerOpen(true);
    });

    return unsubscribe;
  }, [firebaseReady, router]);

  const addProductByBarcode = useCallback(
    async (barcode: string) => {
      const cleanBarcode = barcode.trim();

      if (!cleanBarcode) {
        return;
      }

      if (totalQuantityRef.current >= maxProductsPerSale) {
        setMessage("Esta venta ya tiene el maximo de 10 productos.");
        return;
      }

      setMessage("");

      const existingItem = cartRef.current.find(
        (item) => item.barcode === cleanBarcode
      );

      if (existingItem) {
        if (existingItem.quantity >= existingItem.stock) {
          setMessage("No hay mas stock disponible para este producto.");
          return;
        }

        setCart((currentCart) =>
          currentCart.map((item) =>
            item.id === existingItem.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        );
        showScanToast(existingItem.name);
        return;
      }

      const db = getFirebaseDb();
      const productsQuery = query(
        collection(db, "products"),
        where("barcode", "==", cleanBarcode),
        limit(1)
      );
      const snapshot = await getDocs(productsQuery);

      if (snapshot.empty) {
        setMessage(`No existe un producto con codigo ${cleanBarcode}.`);
        return;
      }

      const productDoc = snapshot.docs[0];
      const data = productDoc.data() as ProductForm;
      const stock = Number(data.stock ?? 0);

      if (stock <= 0) {
        setMessage("Este producto no tiene stock disponible.");
        return;
      }

      const productName = data.name ?? "Producto sin nombre";

      setCart((currentCart) => {
        if (currentCart.reduce((sum, item) => sum + item.quantity, 0) >= maxProductsPerSale) {
          return currentCart;
        }

        return [
          ...currentCart,
          {
            id: productDoc.id,
            barcode: data.barcode ?? cleanBarcode,
            name: productName,
            price: Number(data.price ?? 0),
            cost: Number(data.cost ?? 0),
            stock,
            quantity: 1,
          },
        ];
      });
      showScanToast(productName);
    },
    []
  );

  useEffect(() => {
    if (!scannerOpen || !videoRef.current) {
      return;
    }

    let cancelled = false;

    async function startScanner() {
      setScannerError("");

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const codeReader = new BrowserMultiFormatReader();
        const controls = await codeReader.decodeFromConstraints(
          cameraConstraints,
          videoRef.current ?? undefined,
          (result) => {
            if (!result || cancelled) {
              return;
            }

            const code = result.getText();
            const scanKey = `${code}-${Math.floor(Date.now() / 1200)}`;

            if (lastScanRef.current === scanKey) {
              return;
            }

            lastScanRef.current = scanKey;
            addProductByBarcode(code);
          }
        );

        scannerControlsRef.current = controls;
      } catch {
        setScannerError(
          "No se pudo abrir la camara. Revisa permisos o usa HTTPS en el celular."
        );
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [addProductByBarcode, scannerOpen]);

  function updateQuantity(productId: string, nextQuantity: number) {
    setCart((currentCart) =>
      currentCart.flatMap((item) => {
        if (item.id !== productId) {
          return item;
        }

        if (nextQuantity <= 0) {
          return [];
        }

        return [{ ...item, quantity: Math.min(nextQuantity, item.stock) }];
      })
    );
  }

  function resetSale(openScanner = true) {
    setCart([]);
    setManualCode("");
    setCashReceived(0);
    setTransferAmount(0);
    setPaymentMethod("cash");
    setMessage("");
    setSaleCompleted(false);
    setScannerOpen(openScanner);
  }

  function validatePayment() {
    if (cart.length === 0) {
      return "Escanea al menos un producto.";
    }

    if (paymentMethod === "cash" && cashReceived < total) {
      return "El efectivo recibido no cubre el total.";
    }

    if (paymentMethod === "mixed") {
      if (transferAmount <= 0 || transferAmount >= total) {
        return "En pago mixto, la transferencia debe ser mayor a 0 y menor al total.";
      }

      if (cashReceived < cashDue) {
        return "El efectivo recibido no cubre la parte pendiente.";
      }
    }

    return "";
  }

  async function finishSale() {
    const validationError = validatePayment();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const db = getFirebaseDb();
      const saleRef = doc(collection(db, "sales"));
      const cartSnapshot = cart;

      await runTransaction(db, async (transaction) => {
        const productReads = await Promise.all(
          cartSnapshot.map(async (item) => {
            const productRef = doc(db, "products", item.id);
            const productSnapshot = await transaction.get(productRef);

            if (!productSnapshot.exists()) {
              throw new Error(`El producto ${item.name} ya no existe.`);
            }

            const productData = productSnapshot.data() as ProductForm;
            const currentStock = Number(productData.stock ?? 0);

            if (currentStock < item.quantity) {
              throw new Error(`Stock insuficiente para ${item.name}.`);
            }

            return { productRef, currentStock, item };
          })
        );

        productReads.forEach(({ productRef, currentStock, item }) => {
          transaction.update(productRef, {
            stock: currentStock - item.quantity,
            updatedAt: serverTimestamp(),
            updatedBy: user?.email ?? "",
          });
        });

        transaction.set(saleRef, {
          createdAt: serverTimestamp(),
          cashierEmail: user?.email ?? "",
          items: cartSnapshot.map((item) => ({
            productId: item.id,
            barcode: item.barcode,
            name: item.name,
            unitPrice: item.price,
            unitCost: item.cost,
            quantity: item.quantity,
            subtotal: item.price * item.quantity,
            profit: (item.price - item.cost) * item.quantity,
          })),
          totals: {
            quantity: totalQuantity,
            subtotal: total,
            total,
            cost: totalCost,
            profit,
          },
          payment: {
            method: paymentMethod,
            cashReceived:
              paymentMethod === "transfer" ? 0 : Number(cashReceived),
            transferAmount:
              paymentMethod === "cash"
                ? 0
                : paymentMethod === "transfer"
                  ? total
                  : Number(transferAmount),
            cashDue: paymentMethod === "transfer" ? 0 : cashDue,
            change,
          },
        });
      });

      setSaleCompleted(true);
      setScannerOpen(false);
      const result = await Swal.fire({
        icon: "success",
        title: "Venta finalizada",
        html: `
          <div style="text-align:center">
            <p>Total guardado: <strong>${currency(total)}</strong></p>
            ${
              paymentMethod !== "transfer"
                ? `<p>Cambio: <strong>${currency(change)}</strong></p>`
                : ""
            }
          </div>
        `,
        confirmButtonText: "Otro cliente",
        cancelButtonText: "Regresar",
        showCancelButton: true,
        background: "#071b2f",
        color: "#e0f2fe",
        confirmButtonColor: "#38bdf8",
        cancelButtonColor: "#0f2942",
      });

      if (result.isConfirmed) {
        resetSale(true);
      } else {
        router.push("/panel");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "No se pudo cerrar la venta.";

      setMessage(errorMessage);
      void Swal.fire({
        icon: "error",
        title: "Venta no guardada",
        text: errorMessage,
        confirmButtonText: "Entendido",
        background: "#071b2f",
        color: "#e0f2fe",
        confirmButtonColor: "#38bdf8",
      });
    } finally {
      setSaving(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#030914] px-5 text-slate-100">
        <p className="rounded-lg border border-sky-300/20 bg-[#071b2f] px-4 py-3 text-sm text-slate-300">
          Validando sesion...
        </p>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#030914] px-5 text-slate-100">
        <p className="max-w-sm rounded-lg border border-red-300/30 bg-red-950/45 px-4 py-3 text-center text-sm text-red-100">
          {sessionError}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(145deg,#030914_0%,#071b2f_48%,#0d3155_100%)] px-4 pb-5 pt-[72px] text-slate-100 sm:px-8">
      <section className="mx-auto w-full max-w-xl">
        <header className="mb-5 flex items-center gap-3">
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-300/20 text-slate-300 transition hover:bg-sky-300/10 hover:text-sky-100"
            type="button"
            onClick={() => router.push("/panel")}
            aria-label="Volver al panel"
            title="Volver al panel"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-300">Caja</p>
            <h1 className="truncate text-xl font-semibold">Facturar venta</h1>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-400 text-[#04101f] transition hover:bg-sky-300"
            type="button"
            onClick={() => setScannerOpen(true)}
            aria-label="Abrir camara"
            title="Abrir camara"
          >
            <ScanLine size={20} />
          </button>
        </header>

        {saleCompleted ? (
          <div className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-5 text-center shadow-2xl shadow-black/30">
            <CheckCircle2 className="mx-auto text-sky-300" size={54} />
            <h2 className="mt-4 text-2xl font-semibold">Venta finalizada</h2>
            <p className="mt-2 text-slate-300">
              Total guardado: {currency(total)}
            </p>
            {paymentMethod !== "transfer" ? (
              <p className="mt-2 text-lg font-semibold text-sky-200">
                Cambio: {currency(change)}
              </p>
            ) : null}
            <div className="mt-6 grid gap-3">
              <button
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-400 font-semibold text-[#04101f] transition hover:bg-sky-300"
                type="button"
                onClick={() => resetSale(true)}
              >
                <RotateCcw size={19} />
                Otro cliente
              </button>
              <button
                className="h-12 rounded-lg border border-sky-300/20 text-slate-200 transition hover:bg-sky-300/10"
                type="button"
                onClick={() => router.push("/panel")}
              >
                Regresar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-4 shadow-2xl shadow-black/30">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="flex h-12 items-center gap-3 rounded-lg border border-sky-200/20 bg-[#061425] px-3 focus-within:border-sky-300">
                  <Barcode size={20} className="text-sky-300" />
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-500"
                    value={manualCode}
                    onChange={(event) => setManualCode(event.target.value)}
                    placeholder="Codigo manual"
                  />
                </label>
                <button
                  className="h-12 rounded-lg bg-sky-400 px-4 font-semibold text-[#04101f] transition hover:bg-sky-300"
                  type="button"
                  onClick={() => {
                    addProductByBarcode(manualCode);
                    setManualCode("");
                  }}
                >
                  Agregar
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-300">
                <span>{totalQuantity} / {maxProductsPerSale} productos</span>
                <button
                  className="text-sky-200 underline-offset-4 hover:underline"
                  type="button"
                  onClick={() => setScannerOpen(true)}
                >
                  Escanear con camara
                </button>
              </div>

              {message ? (
                <p className="mt-3 rounded-lg border border-sky-300/20 bg-sky-950/50 px-3 py-2 text-sm text-sky-100">
                  {message}
                </p>
              ) : null}
            </section>

            <section className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/80 p-4 shadow-2xl shadow-black/25">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Productos</h2>
                <ReceiptText size={20} className="text-sky-300" />
              </div>

              <div className="space-y-3">
                {cart.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-sky-200/15 bg-[#061425] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 font-semibold">
                          {item.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-400">
                          {currency(item.price)} / {item.barcode}
                        </p>
                      </div>
                      <button
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-300/25 text-red-100 transition hover:bg-red-400/10"
                        type="button"
                        onClick={() => updateQuantity(item.id, 0)}
                        aria-label="Quitar producto"
                        title="Quitar producto"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-300/20 text-slate-200 transition hover:bg-sky-300/10"
                          type="button"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          aria-label="Restar unidad"
                          title="Restar unidad"
                        >
                          <Minus size={17} />
                        </button>
                        <span className="flex h-9 min-w-12 items-center justify-center rounded-lg bg-[#0b2138] px-3 font-semibold">
                          {item.quantity}
                        </span>
                        <button
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-300/20 text-slate-200 transition hover:bg-sky-300/10"
                          type="button"
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          aria-label="Sumar unidad"
                          title="Sumar unidad"
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      <strong>{currency(item.price * item.quantity)}</strong>
                    </div>
                  </article>
                ))}

                {cart.length === 0 ? (
                  <p className="rounded-lg border border-sky-300/20 bg-[#061425] px-4 py-6 text-center text-sm text-slate-300">
                    Escanea productos para iniciar la venta.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-4 shadow-2xl shadow-black/30">
              <div className="mb-4 rounded-lg bg-[#061425] p-4">
                <span className="text-sm text-slate-400">Total a cobrar</span>
                <p className="mt-1 text-3xl font-semibold text-sky-200">
                  {currency(total)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "cash", label: "Efectivo", icon: Banknote },
                  { value: "transfer", label: "Transf.", icon: CreditCard },
                  { value: "mixed", label: "Mixto", icon: ReceiptText },
                ].map((method) => {
                  const Icon = method.icon;
                  const active = paymentMethod === method.value;

                  return (
                    <button
                      key={method.value}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold transition ${
                        active
                          ? "border-sky-300 bg-sky-400 text-[#04101f]"
                          : "border-sky-300/20 bg-[#061425] text-slate-200 hover:bg-sky-300/10"
                      }`}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(method.value as PaymentMethod);
                        setMessage("");
                      }}
                    >
                      <Icon size={19} />
                      {method.label}
                    </button>
                  );
                })}
              </div>

              {paymentMethod === "mixed" ? (
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm font-medium">
                    Valor por transferencia
                  </span>
                  <input
                    className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                    min="0"
                    max={total}
                    type="number"
                    value={transferAmount}
                    onChange={(event) =>
                      setTransferAmount(Number(event.target.value))
                    }
                  />
                </label>
              ) : null}

              {paymentMethod !== "transfer" ? (
                <label className="mt-4 block">
                  <span className="mb-2 block text-sm font-medium">
                    {paymentMethod === "mixed"
                      ? `Efectivo pendiente: ${currency(cashDue)}`
                      : "Con cuanto cancela"}
                  </span>
                  <input
                    className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                    min="0"
                    type="number"
                    value={cashReceived}
                    onChange={(event) =>
                      setCashReceived(Number(event.target.value))
                    }
                  />
                </label>
              ) : null}

              {paymentMethod !== "transfer" ? (
                <div className="mt-4 rounded-lg border border-sky-300/20 bg-[#061425] px-3 py-3">
                  <span className="text-sm text-slate-400">Cambio</span>
                  <p className="text-2xl font-semibold text-sky-200">
                    {currency(change)}
                  </p>
                </div>
              ) : null}

              <button
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 font-semibold text-[#04101f] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-700 disabled:text-slate-300"
                type="button"
                disabled={saving || cart.length === 0}
                onClick={finishSale}
              >
                <CheckCircle2 size={20} />
                {saving ? "Guardando venta..." : "Finalizar venta"}
              </button>
            </section>
          </div>
        )}
      </section>

      {scannerOpen && !saleCompleted ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-5">
          <div className="w-full max-w-md rounded-[24px] border border-sky-300/20 bg-[#071b2f] p-4 shadow-2xl shadow-black">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-300">Camara</p>
                <h2 className="text-lg font-semibold">Escanear producto</h2>
              </div>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-300/20 text-slate-300 transition hover:bg-sky-300/10"
                type="button"
                onClick={() => setScannerOpen(false)}
                aria-label="Cerrar escaner"
                title="Cerrar escaner"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="aspect-[3/4] w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-sky-300 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
              <div className="pointer-events-none absolute inset-x-12 top-1/2 h-0.5 -translate-y-1/2 bg-sky-300/80" />
            </div>

            {scannerError ? (
              <p className="mt-3 rounded-lg border border-red-300/30 bg-red-950/45 px-3 py-2 text-sm text-red-100">
                {scannerError}
              </p>
            ) : (
              <p className="mt-3 text-center text-sm text-slate-300">
                Escanea uno por uno. Puedes cerrar la camara para cobrar.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
