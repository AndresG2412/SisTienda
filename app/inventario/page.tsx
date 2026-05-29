"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackagePlus, Search } from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { CardProduct } from "@/components/CardProduct";
import {
  getFirebaseAuth,
  getFirebaseDb,
  hasFirebaseConfig,
} from "@/lib/firebase";
import { defaultCategories, Product, ProductForm } from "@/lib/products";

export default function InventoryPage() {
  const router = useRouter();
  const firebaseReady = hasFirebaseConfig();
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(firebaseReady);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
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

  async function removeProduct(product: Product) {
    const confirmed = window.confirm(`Eliminar ${product.name}?`);

    if (!confirmed) {
      return;
    }

    const db = getFirebaseDb();
    await deleteDoc(doc(db, "products", product.id));
    setMessage("Producto eliminado.");
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
      <section className="mx-auto w-full max-w-6xl">
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
            <p className="text-sm text-slate-300">Inventario</p>
            <h1 className="truncate text-xl font-semibold">
              Productos registrados
            </h1>
          </div>

          <button
            className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-400 px-3 font-semibold text-[#04101f] transition hover:bg-sky-300 sm:px-4"
            type="button"
            onClick={() => router.push("/inventario/nuevo")}
          >
            <PackagePlus size={19} />
            <span className="hidden sm:inline">Agregar producto</span>
          </button>
        </header>

        <div className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/80 p-4 shadow-2xl shadow-black/25 sm:p-5">
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

          {message ? (
            <p className="mb-4 rounded-lg border border-sky-300/20 bg-sky-950/50 px-3 py-2 text-sm text-sky-100">
              {message}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <CardProduct
                key={product.id}
                product={product}
                onEdit={() => router.push(`/inventario/nuevo?id=${product.id}`)}
                onDelete={removeProduct}
              />
            ))}

            {filteredProducts.length === 0 ? (
              <p className="rounded-lg border border-sky-300/20 bg-[#061425] px-4 py-6 text-center text-sm text-slate-300 md:col-span-2 xl:col-span-3">
                No hay productos para esta busqueda.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
