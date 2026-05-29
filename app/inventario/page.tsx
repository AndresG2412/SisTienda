"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { IScannerControls } from "@zxing/browser";
import {
  ArrowLeft,
  Barcode,
  Camera,
  Edit3,
  ImagePlus,
  PackagePlus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  hasFirebaseConfig,
} from "@/lib/firebase";

type Product = {
  id: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  unit: string;
  supplier: string;
  notes: string;
  imageUrl: string;
};

type ProductForm = Omit<Product, "id">;

const emptyForm: ProductForm = {
  barcode: "",
  name: "",
  category: "",
  price: 0,
  cost: 0,
  stock: 1,
  minStock: 1,
  unit: "unidad",
  supplier: "",
  notes: "",
  imageUrl: "",
};

const defaultCategories = [
  "Bebidas",
  "Aseo",
  "Despensa",
  "Dulceria",
  "Lacteos",
  "Panaderia",
  "Otros",
];

function currency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
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

export default function InventoryPage() {
  const router = useRouter();
  const firebaseReady = hasFirebaseConfig();
  const cloudinaryReady = cloudinaryIsReady();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(firebaseReady);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
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
    if (!firebaseReady || !user) {
      return;
    }

    const db = getFirebaseDb();
    const productsQuery = query(
      collection(db, "products"),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(productsQuery, (snapshot) => {
      const nextProducts = snapshot.docs.map((productDoc) => {
        const data = productDoc.data() as ProductForm;

        return {
          id: productDoc.id,
          barcode: data.barcode ?? "",
          name: data.name ?? "",
          category: data.category ?? "Otros",
          price: Number(data.price ?? 0),
          cost: Number(data.cost ?? 0),
          stock: Number(data.stock ?? 0),
          minStock: Number(data.minStock ?? 0),
          unit: data.unit ?? "unidad",
          supplier: data.supplier ?? "",
          notes: data.notes ?? "",
          imageUrl: data.imageUrl ?? "",
        };
      });

      setProducts(nextProducts);
    });
  }, [firebaseReady, user]);

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
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result) => {
            if (!result || cancelled) {
              return;
            }

            setForm((current) => ({
              ...current,
              barcode: result.getText(),
            }));
            setScannerOpen(false);
            setMessage("Codigo detectado y cargado en el formulario.");
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

  const categories = useMemo(() => {
    const productCategories = products
      .map((product) => product.category)
      .filter(Boolean);

    return Array.from(new Set([...defaultCategories, ...productCategories]));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        categoryFilter === "Todas" || product.category === categoryFilter;
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        product.barcode.toLowerCase().includes(normalizedSearch) ||
        product.supplier.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, products, search]);

  function updateForm(field: keyof ProductForm, value: string | number) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setImageFile(null);
    setEditingId(null);
    setMessage("");
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setImageFile(null);
    setForm({
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      minStock: product.minStock,
      unit: product.unit,
      supplier: product.supplier,
      notes: product.notes,
      imageUrl: product.imageUrl,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeProduct(product: Product) {
    const confirmed = window.confirm(`Eliminar ${product.name}?`);

    if (!confirmed) {
      return;
    }

    const db = getFirebaseDb();
    await deleteDoc(doc(db, "products", product.id));
    setMessage("Producto eliminado.");
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
        category: form.category.trim() || "Otros",
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
        setMessage("Producto actualizado.");
      } else {
        await addDoc(collection(db, "products"), {
          ...productData,
          createdAt: serverTimestamp(),
          createdBy: user?.email ?? "",
        });
        setMessage("Producto agregado al inventario.");
      }

      resetForm();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto."
      );
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
    <main className="min-h-screen bg-[linear-gradient(145deg,#030914_0%,#071b2f_48%,#0d3155_100%)] px-4 py-5 text-slate-100 sm:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[390px_1fr]">
        <section className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-4 shadow-2xl shadow-black/30 sm:p-5">
          <header className="mb-5 flex items-center justify-between gap-3">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-sky-300/20 text-slate-300 transition hover:bg-sky-300/10 hover:text-sky-100"
              type="button"
              onClick={() => router.push("/panel")}
              aria-label="Volver al panel"
              title="Volver al panel"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-300">Inventario</p>
              <h1 className="truncate text-xl font-semibold">
                {editingId ? "Editar producto" : "Registrar producto"}
              </h1>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-400 text-[#04101f]">
              <PackagePlus size={21} />
            </span>
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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Categoria
                </span>
                <input
                  className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none placeholder:text-slate-500 focus:border-sky-300"
                  list="product-categories"
                  value={form.category}
                  onChange={(event) =>
                    updateForm("category", event.target.value)
                  }
                  placeholder="Ej: Bebidas"
                  required
                />
                <datalist id="product-categories">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
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

            <div className="grid grid-cols-[1fr_auto] gap-3">
              <button
                className="flex h-12 items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 font-semibold text-[#04101f] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-700 disabled:text-slate-300"
                type="submit"
                disabled={saving}
              >
                <Save size={19} />
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Guardar"}
              </button>
              <button
                className="flex h-12 w-12 items-center justify-center rounded-lg border border-sky-300/20 text-slate-300 transition hover:bg-sky-300/10 hover:text-sky-100"
                type="button"
                onClick={resetForm}
                aria-label="Limpiar formulario"
                title="Limpiar formulario"
              >
                <X size={20} />
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/80 p-4 shadow-2xl shadow-black/25 sm:p-5">
          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_190px]">
            <label className="flex h-12 items-center gap-3 rounded-lg border border-sky-200/20 bg-[#061425] px-3 focus-within:border-sky-300">
              <Search size={19} className="text-sky-300" />
              <input
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-500"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre, codigo o proveedor"
              />
            </label>

            <select
              className="h-12 rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="Todas">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3 text-sm text-slate-300">
            <span>{filteredProducts.length} productos visibles</span>
            <span>{products.length} registrados</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-lg border border-sky-200/20 bg-[#061425] shadow-lg shadow-black/10"
              >
                <div className="relative h-40 bg-[#0d2945]">
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fill
                      sizes="(min-width: 768px) 320px, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sky-200">
                      <ImagePlus size={42} />
                    </div>
                  )}
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="line-clamp-2 text-lg font-semibold">
                        {product.name}
                      </h2>
                      <span
                        className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                          product.stock <= product.minStock
                            ? "bg-red-400 text-[#210407]"
                            : "bg-sky-400 text-[#04101f]"
                        }`}
                      >
                        {product.stock}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                      {product.category} · {product.unit}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <span className="rounded-lg bg-[#0b2138] px-3 py-2">
                      <span className="block text-slate-400">Precio</span>
                      <strong>{currency(product.price)}</strong>
                    </span>
                    <span className="rounded-lg bg-[#0b2138] px-3 py-2">
                      <span className="block text-slate-400">Codigo</span>
                      <strong className="break-all">{product.barcode}</strong>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="flex h-10 items-center justify-center gap-2 rounded-lg border border-sky-300/25 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/10"
                      type="button"
                      onClick={() => editProduct(product)}
                    >
                      <Edit3 size={17} />
                      Editar
                    </button>
                    <button
                      className="flex h-10 items-center justify-center gap-2 rounded-lg border border-red-300/25 text-sm font-semibold text-red-100 transition hover:bg-red-400/10"
                      type="button"
                      onClick={() => removeProduct(product)}
                    >
                      <Trash2 size={17} />
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {filteredProducts.length === 0 ? (
              <p className="rounded-lg border border-sky-300/20 bg-[#061425] px-4 py-6 text-center text-sm text-slate-300 md:col-span-2">
                No hay productos para esta busqueda.
              </p>
            ) : null}
          </div>
        </section>
      </div>

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

            <video
              ref={videoRef}
              className="aspect-[3/4] w-full rounded-lg bg-black object-cover"
              muted
              playsInline
            />

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
