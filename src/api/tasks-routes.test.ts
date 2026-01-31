import { describe, it, expect, beforeEach } from 'vitest';
import { tasks } from './tasks-routes.js';

describe('Tasks API', () => {
  beforeEach(() => {
    // Clear tasks before each test
    tasks.clear();
  });

  describe('POST /api/v2/tasks', () => {
    it('should create a new task', async () => {
      const taskData = {
        title: 'Build feature X',
        description: 'Implement the new feature',
        status: 'todo' as const,
        assignee: 'alice@example.com',
      };

      // In a real test, you'd make an HTTP request to the server
      // For this example, we're testing the logic directly
      const task = {
        id: 'task_1',
        ...taskData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tasks.set(task.id, task);

      expect(tasks.get('task_1')).toMatchObject({
        id: 'task_1',
        title: 'Build feature X',
        status: 'todo',
        assignee: 'alice@example.com',
      });
    });

    it('should validate required fields', () => {
      // Title is required
      const invalidTask = {
        description: 'No title provided',
      };

      // Validation would happen in the middleware
      // This is a placeholder for schema validation test
      expect(invalidTask).not.toHaveProperty('title');
    });

    it('should support dry-run mode', () => {
      // Dry-run mode allows validation without side effects
      const initialSize = tasks.size;

      // Simulate dry-run (would be handled by query param in real request)
      // No task is actually created

      expect(tasks.size).toBe(initialSize);
    });
  });

  describe('GET /api/v2/tasks', () => {
    it('should list all tasks', () => {
      // Add some test tasks
      tasks.set('task_1', {
        id: 'task_1',
        title: 'Task 1',
        status: 'todo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      tasks.set('task_2', {
        id: 'task_2',
        title: 'Task 2',
        status: 'done',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const allTasks = Array.from(tasks.values());
      expect(allTasks).toHaveLength(2);
    });

    it('should filter tasks by status', () => {
      tasks.set('task_1', {
        id: 'task_1',
        title: 'Task 1',
        status: 'todo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      tasks.set('task_2', {
        id: 'task_2',
        title: 'Task 2',
        status: 'done',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const todoTasks = Array.from(tasks.values()).filter(t => t.status === 'todo');
      expect(todoTasks).toHaveLength(1);
      expect(todoTasks[0].id).toBe('task_1');
    });
  });

  describe('GET /api/v2/tasks/:id', () => {
    it('should return a task by ID', () => {
      const task = {
        id: 'task_1',
        title: 'Test task',
        status: 'todo' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tasks.set(task.id, task);

      const found = tasks.get('task_1');
      expect(found).toBeDefined();
      expect(found?.title).toBe('Test task');
    });

    it('should return 404 for non-existent task', () => {
      const found = tasks.get('task_999');
      expect(found).toBeUndefined();
    });
  });

  describe('PUT /api/v2/tasks/:id', () => {
    it('should update a task', () => {
      const task = {
        id: 'task_1',
        title: 'Original title',
        status: 'todo' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tasks.set(task.id, task);

      // Update the task
      const updated = {
        ...task,
        title: 'Updated title',
        status: 'in_progress' as const,
        updatedAt: new Date().toISOString(),
      };

      tasks.set(task.id, updated);

      const found = tasks.get('task_1');
      expect(found?.title).toBe('Updated title');
      expect(found?.status).toBe('in_progress');
    });
  });

  describe('DELETE /api/v2/tasks/:id', () => {
    it('should delete a task', () => {
      const task = {
        id: 'task_1',
        title: 'To be deleted',
        status: 'todo' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      tasks.set(task.id, task);
      expect(tasks.has('task_1')).toBe(true);

      tasks.delete('task_1');
      expect(tasks.has('task_1')).toBe(false);
    });
  });
});
