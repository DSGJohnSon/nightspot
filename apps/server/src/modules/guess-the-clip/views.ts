import type { ViewsJob } from '@nightspot/shared';
import { getClips, saveClips } from './catalog';
import { fetchViews } from './media';

const PARALLEL = 4;

let job: ViewsJob = { running: false, done: 0, total: 0, errors: 0, finishedAt: null };

export function getViewsJob(): ViewsJob {
  return job;
}

/** Met à jour les vues YouTube de tout le catalogue (base du calcul de difficulté). */
export function startViewsJob(): void {
  if (job.running) return;
  const queue = getClips().map((c) => ({ id: c.id, youtubeId: c.youtubeId }));
  const views = new Map<string, number>();
  job = { running: true, done: 0, total: queue.length, errors: 0, finishedAt: null };

  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        views.set(item.id, await fetchViews(item.youtubeId));
      } catch {
        job.errors++;
      }
      job.done++;
    }
  };

  void Promise.all(Array.from({ length: PARALLEL }, worker)).then(() => {
    const now = Date.now();
    // Relu à la fin : les modifications faites dans l'admin pendant la mise à jour sont conservées.
    saveClips(getClips().map((c) => (views.has(c.id) ? { ...c, views: views.get(c.id), viewsCheckedAt: now } : c)));
    job = { ...job, running: false, finishedAt: now };
  });
}
