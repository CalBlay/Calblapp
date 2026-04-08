export interface Deal {
  id: string
  NomEvent: string
  Comercial?: string
  Servei?: string
  Data?: string
  DataInici?: string
  DataFi?: string
  Hora?: string
  HoraFi?: string
  NumPax?: number | null
  Ubicacio?: string
  Color?: string
  StageDot?: string
  origen?: 'zoho' | 'manual'
  attachments?: { name: string; url: string; source: string }[]
  updatedAt?: string
  Menu?: string[]
}
