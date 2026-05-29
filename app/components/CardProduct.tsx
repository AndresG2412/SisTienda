import Image from "next/image";
import { Edit3, ImagePlus, Trash2 } from "lucide-react";
import { Product, currency } from "@/lib/products";

type CardProductProps = {
  product: Product;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
};

export function CardProduct({ product, onEdit, onDelete }: CardProductProps) {
  const lowStock = product.stock <= product.minStock;

  return (
    <article className="overflow-hidden rounded-lg border border-sky-200/20 bg-[#061425] shadow-lg shadow-black/10">
      <div className="flex gap-3 p-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-[#0d2945]">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sky-200">
              <ImagePlus size={30} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-1 text-base font-semibold text-slate-50">
              {product.name}
            </h2>
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                lowStock
                  ? "bg-red-400 text-[#210407]"
                  : "bg-sky-400 text-[#04101f]"
              }`}
            >
              {product.stock}
            </span>
          </div>

          <p className="mt-1 truncate text-sm text-slate-400">
            {product.category} / {product.unit}
          </p>

          <p className="mt-2 text-lg font-semibold text-sky-200">
            {currency(product.price)}
          </p>
        </div>
      </div>

      <div className="grid gap-2 border-t border-sky-200/10 p-3 text-sm">
        <div className="rounded-lg bg-[#0b2138] px-3 py-2">
          <span className="block text-slate-400">Codigo</span>
          <strong className="break-all text-slate-100">{product.barcode}</strong>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-sky-300/25 font-semibold text-sky-100 transition hover:bg-sky-300/10"
            type="button"
            onClick={() => onEdit(product)}
          >
            <Edit3 size={17} />
            Editar
          </button>
          <button
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-red-300/25 font-semibold text-red-100 transition hover:bg-red-400/10"
            type="button"
            onClick={() => onDelete(product)}
          >
            <Trash2 size={17} />
            Eliminar
          </button>
        </div>
      </div>
    </article>
  );
}
