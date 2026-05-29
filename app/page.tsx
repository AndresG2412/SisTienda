"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let firebaseAuth;

    try {
      firebaseAuth = getFirebaseAuth();
    } catch {
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        router.replace("/panel");
      }
    });

    return unsubscribe;
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const firebaseAuth = getFirebaseAuth();

      await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      router.replace("/panel");
    } catch {
      setError("Revisa tus variables de Firebase o tus credenciales.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#103d67_0%,#071525_42%,#030914_100%)] px-5 py-8 text-slate-100">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="w-full max-w-[390px] rounded-[28px] border border-sky-300/20 bg-[#071b2f]/85 p-6 shadow-2xl shadow-black/35 backdrop-blur sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-sky-300/30 bg-[#0d2945] text-sky-200 shadow-inner shadow-black/30">
              <UserRound size={64} strokeWidth={1.8} />
            </div>
            <h1 className="text-2xl font-semibold">Ingreso al sistema</h1>
            <p className="mt-2 text-sm text-slate-300">
              Accede con tu usuario registrado en Firebase.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                Correo electronico
              </span>
              <span className="flex h-12 items-center gap-3 rounded-lg border border-sky-200/20 bg-[#061425] px-3 text-slate-100 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/25">
                <UserRound size={20} className="text-sky-300" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="usuario@correo.com"
                  autoComplete="email"
                  required
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-200">
                Contrasena
              </span>
              <span className="flex h-12 items-center gap-3 rounded-lg border border-sky-200/20 bg-[#061425] px-3 text-slate-100 focus-within:border-sky-300 focus-within:ring-2 focus-within:ring-sky-400/25">
                <LockKeyhole size={20} className="text-sky-300" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tu contrasena"
                  autoComplete="current-password"
                  required
                />
                <button
                  className="rounded-md p-1 text-slate-300 transition hover:bg-sky-300/10 hover:text-sky-200"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                  title={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>

            {error ? (
              <p className="rounded-lg border border-red-300/30 bg-red-950/45 px-3 py-2 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            <button
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 font-semibold text-[#04101f] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-700 disabled:text-slate-300"
              type="submit"
              disabled={loading}
            >
              <LogIn size={20} />
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
