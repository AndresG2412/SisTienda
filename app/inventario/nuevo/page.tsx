"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";
import Swal from "sweetalert2";
import {
  ArrowLeft,
  Barcode,
  Camera,
  ImagePlus,
  Save,
  X,
} from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  hasFirebaseConfig,
} from "@/lib/firebase";
import {
  defaultCategories,
  emptyProductForm,
  ProductForm,
} from "@/lib/products";

const cameraConstraints: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

function showCodeToast(code: string) {
  void Swal.fire({
    toast: true,
    position: "top",
    icon: "success",
    title: `Codigo ${code} detectado`,
    showConfirmButton: false,
    timer: 850,
    timerProgressBar: true,
    background: "#071b2f",
    color: "#e0f2fe",
  });
}

function cloudinaryIsReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  );
}

async function uploadToCloudinary(file: File) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Faltan variables de Cloudinary.");
  }

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", uploadPreset);
  body.append("folder", "sistienda/productos");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body,
    }
  );

  if (!response.ok) {
    throw new Error("No se pudo subir la imagen a Cloudinary.");
  }

  const data = (await response.json()) as { secure_url?: string };

  if (!data.secure_url) {
    throw new Error("Cloudinary no devolvio la URL de la imagen.");
  }

  return data.secure_url;
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030914] px-5 text-slate-100">
      <p className="rounded-lg border border-sky-300/20 bg-[#071b2f] px-4 py-3 text-sm text-slate-300">
        Cargando...
      </p>
    </main>
  );
}

function ProductFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editingId = searchParams.get("id");
  const firebaseReady = hasFirebaseConfig();
  const cloudinaryReady = cloudinaryIsReady();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef("");
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(firebaseReady);
  const [productLoaded, setProductLoaded] = useState(!editingId);
  const [form, setForm] = useState<ProductForm>(emptyProductForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const sessionError = firebaseReady
    ? ""
    : "Configura las variables de Firebase para usar el inventario.";

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
    });

    return unsubscribe;
  }, [firebaseReady, router]);

  useEffect(() => {
    if (!firebaseReady || !user || !editingId) {
      return;
    }

    async function loadProduct() {
      const db = getFirebaseDb();
      const productSnapshot = await getDoc(doc(db, "products", editingId ?? ""));

      if (!productSnapshot.exists()) {
        setMessage("No se encontro el producto.");
        setProductLoaded(true);
        return;
      }

      const data = productSnapshot.data() as ProductForm;

      setForm({
        barcode: data.barcode ?? "",
        name: data.name ?? "",
        category: defaultCategories.includes(data.category)
          ? data.category
          : "Otros",
        price: Number(data.price ?? 0),
        cost: Number(data.cost ?? 0),
        stock: Number(data.stock ?? 0),
        minStock: Number(data.minStock ?? 0),
        unit: data.unit ?? "unidad",
        supplier: data.supplier ?? "",
        notes: data.notes ?? "",
        imageUrl: data.imageUrl ?? "",
      });
      setProductLoaded(true);
    }

    loadProduct();
  }, [editingId, firebaseReady, user]);

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
            setForm((current) => ({
              ...current,
              barcode: code,
            }));
            setScannerOpen(false);
            showCodeToast(code);
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
  }, [scannerOpen]);

  function updateForm(field: keyof ProductForm, value: string | number) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyProductForm);
    setImageFile(null);
    setMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      let imageUrl = form.imageUrl;

      if (imageFile) {
        imageUrl = await uploadToCloudinary(imageFile);
      }

      const productData = {
        ...form,
        barcode: form.barcode.trim(),
        name: form.name.trim(),
        supplier: form.supplier.trim(),
        notes: form.notes.trim(),
        price: Number(form.price),
        cost: Number(form.cost),
        stock: Number(form.stock),
        minStock: Number(form.minStock),
        imageUrl,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email ?? "",
      };

      const db = getFirebaseDb();

      if (editingId) {
        await updateDoc(doc(db, "products", editingId), productData);
        const result = await Swal.fire({
          icon: "success",
          title: "Producto actualizado",
          text: "Los cambios quedaron guardados en el inventario.",
          confirmButtonText: "Regresar",
          cancelButtonText: "Seguir editando",
          showCancelButton: true,
          background: "#071b2f",
          color: "#e0f2fe",
          confirmButtonColor: "#38bdf8",
          cancelButtonColor: "#0f2942",
        });

        if (result.isConfirmed) {
          router.push("/inventario");
        }
      } else {
        await addDoc(collection(db, "products"), {
          ...productData,
          createdAt: serverTimestamp(),
          createdBy: user?.email ?? "",
        });
        const result = await Swal.fire({
          icon: "success",
          title: "Producto subido",
          text: "El producto fue agregado correctamente.",
          confirmButtonText: "Subir otro",
          cancelButtonText: "Regresar",
          showCancelButton: true,
          background: "#071b2f",
          color: "#e0f2fe",
          confirmButtonColor: "#38bdf8",
          cancelButtonColor: "#0f2942",
        });

        if (result.isConfirmed) {
          resetForm();
        } else {
          router.push("/inventario");
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto.";

      setMessage(errorMessage);
      void Swal.fire({
        icon: "error",
        title: "No se pudo guardar",
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

  if (checkingSession || !productLoaded) {
    return <LoadingScreen />;
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
      <section className="mx-auto w-full max-w-xl rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-4 shadow-2xl shadow-black/30 sm:p-5">
        <header className="mb-5 flex items-center justify-between gap-3">
          <button
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-300/20 text-slate-300 transition hover:bg-sky-300/10 hover:text-sky-100"
            type="button"
            onClick={() => router.push("/inventario")}
            aria-label="Volver al inventario"
            title="Volver al inventario"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-300">Inventario</p>
            <h1 className="truncate text-xl font-semibold">
              {editingId ? "Editar producto" : "Agregar producto"}
            </h1>
          </div>
        </header>

        {!cloudinaryReady ? (
          <p className="mb-4 rounded-lg border border-amber-300/30 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
            Agrega tus variables de Cloudinary para subir fotos.
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Codigo</span>
            <span className="flex h-12 items-center gap-2 rounded-lg border border-sky-200/20 bg-[#061425] px-3 focus-within:border-sky-300">
              <Barcode size={20} className="text-sky-300" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-500"
                value={form.barcode}
                onChange={(event) => updateForm("barcode", event.target.value)}
                placeholder="Escanea o escribe el codigo"
                required
              />
              <button
                className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-400 text-[#04101f] transition hover:bg-sky-300"
                type="button"
                onClick={() => setScannerOpen(true)}
                aria-label="Escanear codigo"
                title="Escanear codigo"
              >
                <Camera size={18} />
              </button>
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Nombre</span>
            <input
              className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none placeholder:text-slate-500 focus:border-sky-300"
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Nombre del producto"
              required
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Categoria</span>
              <select
                className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                value={form.category}
                onChange={(event) => updateForm("category", event.target.value)}
                required
              >
                {defaultCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Unidad</span>
              <select
                className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                value={form.unit}
                onChange={(event) => updateForm("unit", event.target.value)}
              >
                <option value="unidad">Unidad</option>
                <option value="paquete">Paquete</option>
                <option value="caja">Caja</option>
                <option value="kg">Kilogramo</option>
                <option value="litro">Litro</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Precio</span>
              <input
                className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                min="0"
                type="number"
                value={form.price}
                onChange={(event) =>
                  updateForm("price", Number(event.target.value))
                }
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">Costo</span>
              <input
                className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                min="0"
                type="number"
                value={form.cost}
                onChange={(event) =>
                  updateForm("cost", Number(event.target.value))
                }
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Cantidad</span>
              <input
                className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                min="0"
                type="number"
                value={form.stock}
                onChange={(event) =>
                  updateForm("stock", Number(event.target.value))
                }
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Stock minimo
              </span>
              <input
                className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                min="0"
                type="number"
                value={form.minStock}
                onChange={(event) =>
                  updateForm("minStock", Number(event.target.value))
                }
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Proveedor</span>
            <input
              className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none placeholder:text-slate-500 focus:border-sky-300"
              value={form.supplier}
              onChange={(event) => updateForm("supplier", event.target.value)}
              placeholder="Opcional"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Foto</span>
            <span className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-sky-200/30 bg-[#061425] px-3 py-3 text-sm text-slate-300">
              <ImagePlus size={20} className="text-sky-300" />
              <span className="min-w-0 flex-1 truncate">
                {imageFile?.name ?? "Tomar foto o seleccionar imagen"}
              </span>
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) =>
                  setImageFile(event.target.files?.[0] ?? null)
                }
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Notas</span>
            <textarea
              className="min-h-20 w-full resize-none rounded-lg border border-sky-200/20 bg-[#061425] px-3 py-3 outline-none placeholder:text-slate-500 focus:border-sky-300"
              value={form.notes}
              onChange={(event) => updateForm("notes", event.target.value)}
              placeholder="Detalles internos del producto"
            />
          </label>

          {message ? (
            <p className="rounded-lg border border-sky-300/20 bg-sky-950/50 px-3 py-2 text-sm text-sky-100">
              {message}
            </p>
          ) : null}

          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 font-semibold text-[#04101f] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-700 disabled:text-slate-300"
            type="submit"
            disabled={saving}
          >
            <Save size={19} />
            {saving ? "Guardando..." : editingId ? "Actualizar" : "Guardar"}
          </button>
        </form>
      </section>

      {scannerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-5">
          <div className="w-full max-w-md rounded-[24px] border border-sky-300/20 bg-[#071b2f] p-4 shadow-2xl shadow-black">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-300">Camara</p>
                <h2 className="text-lg font-semibold">Escanear codigo</h2>
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
                Apunta la camara al codigo de barras del producto.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function ProductFormPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ProductFormContent />
    </Suspense>
  );
}
