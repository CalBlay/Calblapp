/** Executa tasques no crítiques sense bloquejar la resposta HTTP. */
export function runInBackground(label: string, task: () => Promise<unknown>) {
  void task().catch((error) => {
    console.error(`[${label}]`, error)
  })
}
