import { describe, expect, it } from 'vitest';
import { loadTimelineShowcase } from '../src/showcase/timelineShowcase.js';

describe('timeline showcase', () => {
  it('replays three complete canonical routes with distinct endings', async () => {
    const timelines = await loadTimelineShowcase();
    expect(timelines).toHaveLength(3);
    for (const timeline of timelines) {
      expect(timeline.committed, timeline.notes.join(' ')).toBe(true);
      expect(timeline.tick).toBeLessThan(600);
      expect(timeline.endingTitle).not.toBe('No ending recorded');
    }
    expect(timelines.map((timeline) => timeline.endingTitle)).toEqual([
      'The Second Settlement',
      'Ward Inquiry',
      'The Disarmed Dawn',
    ]);
    expect(timelines[2]!.evidence.length).toBeGreaterThanOrEqual(5);
  });
});
