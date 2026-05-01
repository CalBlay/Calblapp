/**
 * Amplada completa del `main` (com Incidències): sense max-w addicional per aprofitar escriptori.
 * Ordre: ModuleHeader → DocumentacioToolbar → contingut.
 */
export default function DocumentacioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 pb-12 sm:px-4 lg:px-6 xl:px-8">
      {children}
    </div>
  )
}
