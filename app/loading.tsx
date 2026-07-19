import { CardSkeleton, HeaderSkeleton, LoadingNote, Shimmer, SideSkeleton } from './skeleton'

export default function BoardLoading() {
  return (
    <>
      <HeaderSkeleton />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_296px]">
        <div>
          <section className="mb-3.5 rounded-[9px] border border-line bg-surface px-[17px] pb-[15px] pt-3.5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Shimmer className="h-7 w-28" />
              <Shimmer className="h-2.5 w-56" />
            </div>
            <Shimmer className="h-[34px]" />
          </section>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            <Shimmer className="h-[29px] w-56" />
            <Shimmer className="h-[29px] w-32" />
            <Shimmer className="h-[29px] w-[150px]" />
          </div>

          <div className="flex flex-col gap-3">
            <CardSkeleton lines={4} />
            <CardSkeleton lines={3} />
          </div>

          <LoadingNote>Đang tải task và worklog từ Jira…</LoadingNote>
        </div>

        <SideSkeleton />
      </div>
    </>
  )
}
