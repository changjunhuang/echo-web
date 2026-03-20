export type ModelCategory = 'text' | 'vision' | 'audio' | 'embedding'

export interface ModelSpec {
  id: string
  name: string
  apiName: string
  category: ModelCategory
  description: string
  contextWindow: number
  maxOutputTokens: number
  inputPricePerMillion: number
  outputPricePerMillion: number
  features: string[]
  isNew?: boolean
  isRecommended?: boolean
}
