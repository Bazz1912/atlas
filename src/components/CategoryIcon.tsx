import {
  Camera,
  Coffee,
  Footprints,
  Landmark,
  MapPin,
  Moon,
  Music,
  Palmtree,
  Plane,
  ShoppingBag,
  Sparkles,
  Trees,
  Utensils,
} from 'lucide-react'
export const categoryIcons = {
  'map-pin': MapPin,
  utensils: Utensils,
  sparkles: Sparkles,
  footprints: Footprints,
  trees: Trees,
  landmark: Landmark,
  plane: Plane,
  shopping: ShoppingBag,
  moon: Moon,
  camera: Camera,
  coffee: Coffee,
  music: Music,
  palm: Palmtree,
}
export const iconLabels: Record<string, string> = {
  'map-pin': 'Luogo',
  utensils: 'Cibo',
  sparkles: 'Scintille',
  footprints: 'Passi',
  trees: 'Alberi',
  landmark: 'Cultura',
  plane: 'Aereo',
  shopping: 'Borsa',
  moon: 'Luna',
  camera: 'Fotografia',
  coffee: 'Caffè',
  music: 'Musica',
  palm: 'Palma',
}
export function CategoryIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = categoryIcons[name as keyof typeof categoryIcons] || MapPin
  return <Icon size={size} strokeWidth={1.8} />
}
