import type { ReferenceCatalogue } from '../../shared/reference'
import { requestJson } from './client'

export async function loadReferenceCatalogue(): Promise<ReferenceCatalogue> {
  return requestJson<ReferenceCatalogue>('/api/catalogue')
}
