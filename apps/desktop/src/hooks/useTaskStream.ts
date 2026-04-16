import { useState, useEffect } from 'react';
import type { TaskDTO, TaskEvent } from '@pipefx/tasks';
import { tasksReducer, taskMapToSortedArray } from '@pipefx/tasks';
import { createTaskStreamUrl } from '../lib/api.js';

/**
 * Hook: subscribes to the SSE task event stream and maintains
 * the derived task map via the shared @pipefx/tasks reducer.
 */
export function useTaskStream(projectId: string) {
  const [taskMap, setTaskMap] = useState<Map<string, TaskDTO>>(new Map());

  useEffect(() => {
    const url = createTaskStreamUrl(projectId || undefined);
    const eventSource = new EventSource(url);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'init') {
          const map = new Map<string, TaskDTO>();
          for (const task of data.tasks as TaskDTO[]) {
            map.set(task.id, task);
          }
          setTaskMap(map);
        } else if (data.type === 'event') {
          const event = data.event as TaskEvent;
          setTaskMap((prev) => tasksReducer(prev, event));
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => eventSource.close();
  }, [projectId]);

  const activeTasks = taskMapToSortedArray(taskMap);

  return { taskMap, activeTasks, setTaskMap };
}
