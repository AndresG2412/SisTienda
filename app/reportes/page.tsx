"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, CalendarDays, ChartColumn, Coins, ReceiptText } from "lucide-react";
import { onAuthStateChanged, User } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  hasFirebaseConfig,
} from "@/lib/firebase";
import { currency } from "@/lib/products";

type ReportMode = "day" | "week" | "month";

type Sale = {
  id: string;
  createdAt: Date;
  total: number;
  cost: number;
  profit: number;
  quantity: number;
};

type ChartRow = {
  label: string;
  total: number;
  profit: number;
};

function inputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function inputMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function startOfDay(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  return date;
}

function endOfDay(dateValue: string) {
  const date = new Date(`${dateValue}T23:59:59.999`);
  return date;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function startOfWeek(dateValue: string) {
  const date = startOfDay(dateValue);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function endOfWeek(dateValue: string) {
  const start = startOfWeek(dateValue);
  const end = addDays(start, 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(monthValue: string) {
  return new Date(`${monthValue}-01T00:00:00`);
}

function endOfMonth(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function shortDay(date: Date) {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "2-digit",
  }).format(date);
}

function weekLabel(index: number) {
  return `Semana ${index + 1}`;
}

function summarizeSales(sales: Sale[]) {
  return sales.reduce(
    (summary, sale) => ({
      total: summary.total + sale.total,
      cost: summary.cost + sale.cost,
      profit: summary.profit + sale.profit,
      quantity: summary.quantity + sale.quantity,
      count: summary.count + 1,
    }),
    { total: 0, cost: 0, profit: 0, quantity: 0, count: 0 }
  );
}

export default function ReportsPage() {
  const router = useRouter();
  const firebaseReady = hasFirebaseConfig();
  const today = useMemo(() => new Date(), []);
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(firebaseReady);
  const [mode, setMode] = useState<ReportMode>("day");
  const [selectedDay, setSelectedDay] = useState(inputDate(today));
  const [selectedWeek, setSelectedWeek] = useState(inputDate(today));
  const [selectedMonth, setSelectedMonth] = useState(inputMonth(today));
  const [sales, setSales] = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  const [message, setMessage] = useState("");

  const sessionError = firebaseReady
    ? ""
    : "Configura las variables de Firebase para usar reportes.";

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

  const range = useMemo(() => {
    if (mode === "day") {
      return {
        start: startOfDay(selectedDay),
        end: endOfDay(selectedDay),
      };
    }

    if (mode === "week") {
      return {
        start: startOfWeek(selectedWeek),
        end: endOfWeek(selectedWeek),
      };
    }

    return {
      start: startOfMonth(selectedMonth),
      end: endOfMonth(selectedMonth),
    };
  }, [mode, selectedDay, selectedMonth, selectedWeek]);

  useEffect(() => {
    if (!firebaseReady || !user) {
      return;
    }

    async function loadSales() {
      setLoadingSales(true);
      setMessage("");

      try {
        const db = getFirebaseDb();
        const salesQuery = query(
          collection(db, "sales"),
          where("createdAt", ">=", Timestamp.fromDate(range.start)),
          where("createdAt", "<=", Timestamp.fromDate(range.end))
        );
        const snapshot = await getDocs(salesQuery);
        const nextSales = snapshot.docs.map((saleDoc) => {
          const data = saleDoc.data();
          const totals = data.totals ?? {};
          const createdAt =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : new Date();

          return {
            id: saleDoc.id,
            createdAt,
            total: Number(totals.total ?? 0),
            cost: Number(totals.cost ?? 0),
            profit: Number(totals.profit ?? 0),
            quantity: Number(totals.quantity ?? 0),
          };
        });

        setSales(nextSales);
      } catch {
        setMessage("No se pudieron cargar las ventas del rango seleccionado.");
      } finally {
        setLoadingSales(false);
      }
    }

    loadSales();
  }, [firebaseReady, range.end, range.start, user]);

  const summary = useMemo(() => summarizeSales(sales), [sales]);

  const chartData = useMemo<ChartRow[]>(() => {
    if (mode === "week") {
      return Array.from({ length: 7 }, (_, index) => {
        const date = addDays(range.start, index);
        const daySales = sales.filter(
          (sale) => inputDate(sale.createdAt) === inputDate(date)
        );
        const daySummary = summarizeSales(daySales);

        return {
          label: shortDay(date),
          total: daySummary.total,
          profit: daySummary.profit,
        };
      });
    }

    if (mode === "month") {
      const weeks = [0, 1, 2, 3, 4, 5];

      return weeks.map((weekIndex) => {
        const weekStart = addDays(range.start, weekIndex * 7);
        const weekEnd = addDays(weekStart, 6);
        weekEnd.setHours(23, 59, 59, 999);
        const weekSales = sales.filter(
          (sale) => sale.createdAt >= weekStart && sale.createdAt <= weekEnd
        );
        const weekSummary = summarizeSales(weekSales);

        return {
          label: weekLabel(weekIndex),
          total: weekSummary.total,
          profit: weekSummary.profit,
        };
      });
    }

    return [];
  }, [mode, range.start, sales]);

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
            <p className="text-sm text-slate-300">Reportes</p>
            <h1 className="truncate text-xl font-semibold">
              Ventas y ganancias
            </h1>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-400 text-[#04101f]">
            <ChartColumn size={20} />
          </span>
        </header>

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-4 shadow-2xl shadow-black/30">
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "day", label: "Dia" },
                { value: "week", label: "Semana" },
                { value: "month", label: "Mes" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`h-11 rounded-lg text-sm font-semibold transition ${
                    mode === option.value
                      ? "bg-sky-400 text-[#04101f]"
                      : "border border-sky-300/20 bg-[#061425] text-slate-200 hover:bg-sky-300/10"
                  }`}
                  type="button"
                  onClick={() => setMode(option.value as ReportMode)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {mode === "day" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Dia a consultar
                  </span>
                  <input
                    className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                    type="date"
                    value={selectedDay}
                    onChange={(event) => setSelectedDay(event.target.value)}
                  />
                </label>
              ) : null}

              {mode === "week" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Semana a consultar
                  </span>
                  <input
                    className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                    type="date"
                    value={selectedWeek}
                    onChange={(event) => setSelectedWeek(event.target.value)}
                  />
                </label>
              ) : null}

              {mode === "month" ? (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Mes a consultar
                  </span>
                  <input
                    className="h-12 w-full rounded-lg border border-sky-200/20 bg-[#061425] px-3 outline-none focus:border-sky-300"
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg bg-[#061425] p-3 text-sm text-slate-300">
              <CalendarDays className="mb-2 text-sky-300" size={20} />
              <p>
                Desde {range.start.toLocaleDateString("es-CO")} hasta{" "}
                {range.end.toLocaleDateString("es-CO")}
              </p>
            </div>
          </aside>

          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-lg border border-sky-300/20 bg-[#071b2f]/90 p-4">
                <ReceiptText className="text-sky-300" size={22} />
                <p className="mt-3 text-sm text-slate-400">Vendido</p>
                <strong className="mt-1 block text-2xl text-sky-100">
                  {currency(summary.total)}
                </strong>
              </article>
              <article className="rounded-lg border border-sky-300/20 bg-[#071b2f]/90 p-4">
                <Coins className="text-sky-300" size={22} />
                <p className="mt-3 text-sm text-slate-400">Ganancia</p>
                <strong className="mt-1 block text-2xl text-sky-100">
                  {currency(summary.profit)}
                </strong>
              </article>
              <article className="rounded-lg border border-sky-300/20 bg-[#071b2f]/90 p-4">
                <ChartColumn className="text-sky-300" size={22} />
                <p className="mt-3 text-sm text-slate-400">Ventas</p>
                <strong className="mt-1 block text-2xl text-sky-100">
                  {summary.count}
                </strong>
              </article>
            </div>

            <div className="rounded-[24px] border border-sky-300/20 bg-[#071b2f]/90 p-4 shadow-2xl shadow-black/25">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {mode === "day"
                      ? "Resumen del dia"
                      : mode === "week"
                        ? "Ventas por dia"
                        : "Ventas por semana"}
                  </h2>
                </div>
                {loadingSales ? (
                  <span className="text-sm text-slate-300">Cargando...</span>
                ) : null}
              </div>

              {mode === "day" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-[#061425] p-4">
                    <p className="text-sm text-slate-400">Costo total</p>
                    <strong className="mt-1 block text-xl">
                      {currency(summary.cost)}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-[#061425] p-4">
                    <p className="text-sm text-slate-400">Productos vendidos</p>
                    <strong className="mt-1 block text-xl">
                      {summary.quantity}
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#16405f" strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke="#cbd5e1" fontSize={12} />
                      <YAxis
                        stroke="#cbd5e1"
                        fontSize={12}
                        tickFormatter={(value) => `$${Number(value) / 1000}k`}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(56, 189, 248, 0.08)" }}
                        contentStyle={{
                          background: "#061425",
                          border: "1px solid rgba(125, 211, 252, 0.25)",
                          borderRadius: 8,
                          color: "#e0f2fe",
                        }}
                        formatter={(value, name) => [
                          currency(Number(value)),
                          name === "total" ? "Vendido" : "Ganancia",
                        ]}
                      />
                      <Bar dataKey="total" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="profit" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {message ? (
                <p className="mt-4 rounded-lg border border-red-300/30 bg-red-950/45 px-3 py-2 text-sm text-red-100">
                  {message}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
