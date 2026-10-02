import { CardSkeleton, Shimmer } from '../skeleton'

export default function SettingsLoading() {
  return (
    <>
      <header className="mb-4 flex flex-col gap-2">
        <Shimmer className="h-3 w-64" />
        <Shimmer className="h-6 w-28" />
      </header>

      <Shimmer className="mb-5 h-10 w-full rounded-xl" />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-2">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={4} />
      </div>
    </>
  )
}
