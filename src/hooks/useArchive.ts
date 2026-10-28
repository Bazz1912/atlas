import { useCallback, useEffect, useState } from 'react'
import type { CategoryRecord, Review, Trip, Visit } from '../domain'
import {
  categoryRepository,
  localAuthor,
  reviewRepository,
  tripRepository,
} from '../services/archive'
export function useArchive() {
  const [data, setData] = useState<{
    categories: CategoryRecord[]
    reviews: Review[]
    visits: Visit[]
    trips: Trip[]
    authorId: string
  }>({ categories: [], reviews: [], visits: [], trips: [], authorId: '' })
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    try {
      const [categories, reviews, visits, trips, authorId] = await Promise.all([
        categoryRepository.list(),
        reviewRepository.list(),
        reviewRepository.visits(),
        tripRepository.list(),
        localAuthor(),
      ])
      setData({ categories, reviews, visits, trips, authorId })
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archivio non disponibile.')
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])
  return { ...data, error, refresh }
}
