"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  ChartColumn,
  FileText,
  LogOut,
  UserRound,
} from "lucide-react";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { getFirebaseAuth, hasFirebaseConfig } from "@/lib/firebase";

const menuItems = [
  {
    title: "Facturar",
    description: "Ventas y comprobantes",
    icon: FileText,
    path: "/facturar",
  },
  {
    title: "Inventario",
    description: "Productos y existencias",
    icon: Boxes,
    path: "/inventario",
  },
  {
    title: "Avisos",
    description: "Alertas pendientes",
    icon: Bell,
  },
  {
    title: "Reportes",
    description: "Resumenes y metricas",
    icon: ChartColumn,
  },
];

export default function PanelPage() {
  const router = useRouter();
  const firebaseReady = hasFirebaseConfig();
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(firebaseReady);
  const sessionError = firebaseReady
    ? ""
    : "Configura las variables de Firebase para validar la sesion.";

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

  async function handleLogout() {
    const firebaseAuth = getFirebaseAuth();

    await signOut(firebaseAuth);
    router.replace("/");
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
    <main className="min-h-screen bg-[linear-gradient(145deg,#030914_0%,#071b2f_46%,#0d3155_100%)] px-5 py-6 text-slate-100 sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <div className="w-full max-w-[460px] rounded-[28px] border border-sky-300/20 bg-[#071b2f]/90 p-5 shadow-2xl shadow-black/35 backdrop-blur sm:p-7">
          <header className="mb-7 flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-300/35 bg-[#0d2945] text-sky-200">
                <UserRound size={26} />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-slate-300">Usuario</p>
                <h1 className="truncate text-base font-semibold text-slate-50">
                  {user?.email ?? "Sesion activa"}
                </h1>
              </div>
            </div>

            <button
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-300/20 text-slate-300 transition hover:border-sky-300/40 hover:bg-sky-300/10 hover:text-sky-100"
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesion"
              title="Cerrar sesion"
            >
              <LogOut size={19} />
            </button>
          </header>

          <div className="grid gap-4">
            {menuItems.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.title}
                  className="group flex min-h-20 items-center gap-4 rounded-lg border border-sky-200/20 bg-[#061425] px-4 text-left shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:border-sky-300/60 hover:bg-[#0b2b49] focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                  type="button"
                  onClick={() => {
                    if (item.path) {
                      router.push(item.path);
                    }
                  }}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-400 text-[#04101f] transition group-hover:bg-sky-300">
                    <Icon size={25} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-lg font-semibold text-slate-50">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-sm text-slate-300">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
