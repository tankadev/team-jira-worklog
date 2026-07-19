import { CardSkeleton, Shimmer } from '../skeleton'

export default function SettingsLoading() {
  return (
    <>
      <header className="mb-4 flex flex-col gap-2">
        <Shimmer className="h-3 w-64" />
        <Shimmer className="h-6 w-28" />
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={3} />
        </div>
        <div className="flex flex-col gap-4">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    </>
  )
}
