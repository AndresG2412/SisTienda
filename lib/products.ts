export type Product = {
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

export type ProductForm = Omit<Product, "id">;

export const defaultCategories = [
  "Bebidas",
  "Aseo",
  "Despensa",
  "Dulceria",
  "Lacteos",
  "Panaderia",
  "Otros",
];

export const emptyProductForm: ProductForm = {
  barcode: "",
  name: "",
  category: defaultCategories[0],
  price: 0,
  cost: 0,
  stock: 1,
  minStock: 1,
  unit: "unidad",
  supplier: "",
  notes: "",
  imageUrl: "",
};

export function currency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
