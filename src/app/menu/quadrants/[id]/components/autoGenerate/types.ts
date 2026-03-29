export type AutoGeneratePhase = {
  key: string
  label: string
}

export type ServeiGroup = {
  id: string
  serviceDate: string
  dateLabel: string
  meetingPoint: string
  startTime: string
  endTime: string
  workers: number
  jamoneros: number
  drivers: number
  needsDriver: boolean
  driverId: string | null
}
