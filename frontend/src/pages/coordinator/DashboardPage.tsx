import { PriorityQueue } from '@/components/coordinator/PriorityQueue';
import { ActivityFeed } from '@/components/coordinator/ActivityFeed';
import { QuickStats } from '@/components/coordinator/QuickStats';
import { ShiftBriefCard } from '@/components/coordinator/ShiftBriefCard';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <ShiftBriefCard />
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-4 order-2 xl:order-1">
          <PriorityQueue />
        </section>
        <section className="xl:col-span-5 order-1 xl:order-2">
          <ActivityFeed />
        </section>
        <section className="xl:col-span-3 order-3">
          <QuickStats />
        </section>
      </div>
    </div>
  );
}
