export type DocumentacioSearchResult =
  | {
      type: 'topic'
      title: string
      ambit: string
      ambitTitle: string
      topicSlug: string
      href: string
    }
  | {
      type: 'document'
      id: string
      label: string
      ambit: string
      ambitTitle: string
      topicSlug: string
      topicTitle: string
      href: string
      kind: 'file' | 'link'
    }
