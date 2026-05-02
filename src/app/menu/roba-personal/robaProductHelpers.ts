import type { ProductRow } from './robaPersonalTypes'

export function productById(products: ProductRow[], id: string): ProductRow | undefined {
  return products.find((x) => x.id === id)
}
