/**
 * Amplada completa del `main` a escriptori (com Documentació / Edició).
 */
export default function CostServeisLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 pb-12 sm:px-4 lg:px-6 xl:px-8">
      {children}
    </div>
  )
}
