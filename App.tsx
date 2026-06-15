import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type TaskPriority = 'focus' | 'later';
type DayBlock = 'morning' | 'afternoon' | 'night';

type Task = {
  id: string;
  title: string;
  priority: TaskPriority;
  block: DayBlock;
  date: string;
  done: boolean;
  createdAt: string;
};

type Habit = {
  id: string;
  title: string;
  cue: string;
  completedDates: string[];
  createdAt: string;
};

type AppData = {
  tasks: Task[];
  habits: Habit[];
};

type NextAction =
  | { kind: 'task'; id: string; title: string; detail: string }
  | { kind: 'habit'; id: string; title: string; detail: string }
  | { kind: 'done'; title: string; detail: string };

const STORAGE_KEY = '@dia-claro/app-state-v1';

const seedData: AppData = {
  tasks: [],
  habits: [
    createSeedHabit('Tomar agua', 'mañana'),
    createSeedHabit('Mover el cuerpo', 'tarde'),
    createSeedHabit('Ordenar 10 min', 'tarde'),
    createSeedHabit('Preparar mañana', 'noche'),
  ],
};

export default function App() {
  const [data, setData] = useState<AppData>(seedData);
  const [isReady, setIsReady] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [habitTitle, setHabitTitle] = useState('');
  const [selectedPriority, setSelectedPriority] = useState<TaskPriority>('focus');
  const today = getTodayKey();

  useEffect(() => {
    async function loadData() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setData(JSON.parse(stored) as AppData);
        }
      } catch (error) {
        console.warn('No se pudo cargar el estado guardado', error);
      } finally {
        setIsReady(true);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((error) => {
      console.warn('No se pudo guardar el estado', error);
    });
  }, [data, isReady]);

  const todayTasks = useMemo(
    () => data.tasks.filter((task) => task.date === today),
    [data.tasks, today],
  );
  const focusTasks = todayTasks.filter((task) => task.priority === 'focus');
  const laterTasks = todayTasks.filter((task) => task.priority === 'later');
  const completedTasks = todayTasks.filter((task) => task.done).length;
  const completedHabits = data.habits.filter((habit) =>
    habit.completedDates.includes(today),
  ).length;
  const totalItems = todayTasks.length + data.habits.length;
  const completedItems = completedTasks + completedHabits;
  const completion = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
  const nextAction = getNextAction(focusTasks, laterTasks, data.habits, today);
  const weekDays = getRecentDays(today, 7);

  function addTask() {
    const title = taskTitle.trim();
    if (!title) {
      return;
    }

    const newTask: Task = {
      id: createId('task'),
      title,
      priority: selectedPriority,
      block: getCurrentBlock(),
      date: today,
      done: false,
      createdAt: new Date().toISOString(),
    };

    setData((current) => ({ ...current, tasks: [newTask, ...current.tasks] }));
    setTaskTitle('');
  }

  function addHabit() {
    const title = habitTitle.trim();
    if (!title) {
      return;
    }

    const newHabit: Habit = {
      id: createId('habit'),
      title,
      cue: getBlockLabel(getCurrentBlock()).toLowerCase(),
      completedDates: [],
      createdAt: new Date().toISOString(),
    };

    setData((current) => ({ ...current, habits: [newHabit, ...current.habits] }));
    setHabitTitle('');
  }

  function toggleTask(id: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    }));
  }

  function toggleHabit(id: string) {
    setData((current) => ({
      ...current,
      habits: current.habits.map((habit) => {
        if (habit.id !== id) {
          return habit;
        }

        const isDone = habit.completedDates.includes(today);
        return {
          ...habit,
          completedDates: isDone
            ? habit.completedDates.filter((date) => date !== today)
            : [...habit.completedDates, today],
        };
      }),
    }));
  }

  function deleteTask(id: string) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== id),
    }));
  }

  function deleteHabit(id: string) {
    setData((current) => ({
      ...current,
      habits: current.habits.filter((habit) => habit.id !== id),
    }));
  }

  function completeNextAction() {
    if (nextAction.kind === 'task') {
      toggleTask(nextAction.id);
    }

    if (nextAction.kind === 'habit') {
      toggleHabit(nextAction.id);
    }
  }

  function moveOpenTasksToTomorrow() {
    const tomorrow = shiftDate(today, 1);
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.date === today && !task.done
          ? { ...task, date: tomorrow, priority: 'focus' }
          : task,
      ),
    }));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardRoot}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>{formatLongDate(today)}</Text>
              <Text style={styles.title}>Día Claro</Text>
            </View>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreNumber}>{completion}%</Text>
              <Text style={styles.scoreLabel}>hoy</Text>
            </View>
          </View>

          <View style={styles.actionPanel}>
            <View style={styles.actionIcon}>
              <Feather
                name={nextAction.kind === 'done' ? 'sun' : 'zap'}
                size={24}
                color="#F7F7FB"
              />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.sectionEyebrow}>Ahora</Text>
              <Text style={styles.actionTitle}>{nextAction.title}</Text>
              <Text style={styles.actionDetail}>{nextAction.detail}</Text>
            </View>
            {nextAction.kind !== 'done' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Marcar siguiente accion como completada"
                onPress={completeNextAction}
                style={({ pressed }) => [styles.iconButtonDark, pressed && styles.pressed]}
              >
                <Feather name="check" size={22} color="#F7F7FB" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.inputPanel}>
            <Text style={styles.panelTitle}>Captura rápida</Text>
            <View style={styles.segmentedControl}>
              <PriorityPill
                label="Importante"
                selected={selectedPriority === 'focus'}
                onPress={() => setSelectedPriority('focus')}
              />
              <PriorityPill
                label="Más tarde"
                selected={selectedPriority === 'later'}
                onPress={() => setSelectedPriority('later')}
              />
            </View>
            <View style={styles.inputRow}>
              <TextInput
                value={taskTitle}
                onChangeText={setTaskTitle}
                onSubmitEditing={addTask}
                placeholder="Nueva tarea"
                placeholderTextColor="#858A96"
                returnKeyType="done"
                style={styles.textInput}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agregar tarea"
                onPress={addTask}
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              >
                <Feather name="plus" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lo importante</Text>
            <Text style={styles.sectionMeta}>{getDoneLabel(focusTasks)}</Text>
          </View>
          <TaskList
            emptyText="Elige una tarea principal."
            tasks={focusTasks}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Hábitos de hoy</Text>
            <Text style={styles.sectionMeta}>
              {completedHabits}/{data.habits.length}
            </Text>
          </View>
          <View style={styles.listStack}>
            {data.habits.map((habit) => {
              const isDone = habit.completedDates.includes(today);
              const streak = getHabitStreak(habit, today);

              return (
                <View key={habit.id} style={styles.rowCard}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isDone }}
                    accessibilityLabel={`Marcar hábito ${habit.title}`}
                    onPress={() => toggleHabit(habit.id)}
                    style={({ pressed }) => [
                      styles.checkButton,
                      isDone && styles.checkButtonDone,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Feather
                      name={isDone ? 'check' : 'circle'}
                      size={20}
                      color={isDone ? '#FFFFFF' : '#1E7F78'}
                    />
                  </Pressable>
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, isDone && styles.doneText]} numberOfLines={1}>
                      {habit.title}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {habit.cue} · {streak} día{streak === 1 ? '' : 's'} seguidos
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar hábito ${habit.title}`}
                    onPress={() => deleteHabit(habit.id)}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
                  >
                    <Feather name="trash-2" size={18} color="#9B3D3A" />
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={styles.inputRowCompact}>
            <TextInput
              value={habitTitle}
              onChangeText={setHabitTitle}
              onSubmitEditing={addHabit}
              placeholder="Nuevo hábito"
              placeholderTextColor="#858A96"
              returnKeyType="done"
              style={styles.textInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar hábito"
              onPress={addHabit}
              style={({ pressed }) => [styles.addButtonSecondary, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="plus" size={24} color="#1E7F78" />
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Más tarde</Text>
            <Text style={styles.sectionMeta}>{getDoneLabel(laterTasks)}</Text>
          </View>
          <TaskList
            emptyText="Sin pendientes secundarios."
            tasks={laterTasks}
            onToggle={toggleTask}
            onDelete={deleteTask}
          />

          <View style={styles.weekPanel}>
            <View style={styles.sectionHeaderTight}>
              <Text style={styles.sectionTitle}>Cumplimiento</Text>
              <Text style={styles.sectionMeta}>{completedHabits} hábitos hoy</Text>
            </View>
            <View style={styles.weekGrid}>
              {weekDays.map((day) => {
                const percent = getHabitCompletionForDay(data.habits, day);
                const isToday = day === today;

                return (
                  <View
                    key={day}
                    style={[styles.dayCell, isToday && styles.dayCellToday]}
                  >
                    <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                      {formatShortDay(day)}
                    </Text>
                    <View style={styles.dayTrack}>
                      <View style={[styles.dayFill, { height: `${percent}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.closePanel}>
            <View style={styles.closeIcon}>
              <Feather name="moon" size={20} color="#244B6A" />
            </View>
            <View style={styles.closeText}>
              <Text style={styles.closeTitle}>Cierre del día</Text>
              <Text style={styles.closeMeta}>{getClosingCopy(todayTasks, data.habits, today)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mover pendientes abiertos a mañana"
              onPress={moveOpenTasksToTomorrow}
              style={({ pressed }) => [styles.carryButton, pressed && styles.pressed]}
            >
              <Feather name="arrow-right" size={20} color="#244B6A" />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TaskList({
  tasks,
  emptyText,
  onToggle,
  onDelete,
}: {
  tasks: Task[];
  emptyText: string;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.listStack}>
      {tasks.map((task) => (
        <View key={task.id} style={styles.rowCard}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: task.done }}
            accessibilityLabel={`Marcar tarea ${task.title}`}
            onPress={() => onToggle(task.id)}
            style={({ pressed }) => [
              styles.checkButton,
              task.done && styles.checkButtonDone,
              pressed && styles.pressed,
            ]}
          >
            <Feather
              name={task.done ? 'check' : 'circle'}
              size={20}
              color={task.done ? '#FFFFFF' : '#1E7F78'}
            />
          </Pressable>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, task.done && styles.doneText]} numberOfLines={2}>
              {task.title}
            </Text>
            <Text style={styles.rowMeta}>{getBlockLabel(task.block)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Eliminar tarea ${task.title}`}
            onPress={() => onDelete(task.id)}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={18} color="#9B3D3A" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function PriorityPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.priorityPill,
        selected && styles.priorityPillSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.priorityText, selected && styles.priorityTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createSeedHabit(title: string, cue: string): Habit {
  return {
    id: `seed-${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    cue,
    completedDates: [],
    createdAt: new Date().toISOString(),
  };
}

function getNextAction(
  focusTasks: Task[],
  laterTasks: Task[],
  habits: Habit[],
  today: string,
): NextAction {
  const focus = focusTasks.find((task) => !task.done);
  if (focus) {
    return {
      kind: 'task',
      id: focus.id,
      title: focus.title,
      detail: 'Primer avance: 15 minutos.',
    };
  }

  const habit = habits.find((item) => !item.completedDates.includes(today));
  if (habit) {
    return {
      kind: 'habit',
      id: habit.id,
      title: habit.title,
      detail: `Bloque ${habit.cue}.`,
    };
  }

  const later = laterTasks.find((task) => !task.done);
  if (later) {
    return {
      kind: 'task',
      id: later.id,
      title: later.title,
      detail: 'Pendiente secundario.',
    };
  }

  return {
    kind: 'done',
    title: 'Día encaminado',
    detail: 'Cierra ligero y prepara mañana.',
  };
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(key: string, amount: number) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

function formatLongDate(key: string) {
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseDateKey(key));
}

function formatShortDay(key: string) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short' })
    .format(parseDateKey(key))
    .replace('.', '');
}

function getRecentDays(today: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftDate(today, index - count + 1));
}

function getCurrentBlock(): DayBlock {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'morning';
  }

  if (hour < 19) {
    return 'afternoon';
  }

  return 'night';
}

function getBlockLabel(block: DayBlock) {
  const labels: Record<DayBlock, string> = {
    morning: 'Mañana',
    afternoon: 'Tarde',
    night: 'Noche',
  };

  return labels[block];
}

function getDoneLabel(tasks: Task[]) {
  const done = tasks.filter((task) => task.done).length;
  return `${done}/${tasks.length}`;
}

function getHabitStreak(habit: Habit, today: string) {
  let streak = 0;
  let cursor = today;

  while (habit.completedDates.includes(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  return streak;
}

function getHabitCompletionForDay(habits: Habit[], day: string) {
  if (habits.length === 0) {
    return 0;
  }

  const completed = habits.filter((habit) => habit.completedDates.includes(day)).length;
  return Math.round((completed / habits.length) * 100);
}

function getClosingCopy(tasks: Task[], habits: Habit[], today: string) {
  const openTasks = tasks.filter((task) => !task.done).length;
  const openHabits = habits.filter((habit) => !habit.completedDates.includes(today)).length;

  if (openTasks === 0 && openHabits === 0) {
    return 'Todo lo de hoy quedó marcado.';
  }

  if (openTasks > 0) {
    return `${openTasks} pendiente${openTasks === 1 ? '' : 's'} puede${
      openTasks === 1 ? '' : 'n'
    } pasar a mañana.`;
  }

  return `${openHabits} hábito${openHabits === 1 ? '' : 's'} queda${
    openHabits === 1 ? '' : 'n'
  } abierto${openHabits === 1 ? '' : 's'}.`;
}

const colors = {
  background: '#F7F7FB',
  panel: '#FFFFFF',
  ink: '#1F2733',
  muted: '#69707D',
  line: '#E1E5EA',
  teal: '#1E7F78',
  tealDark: '#135A55',
  coral: '#E35D5B',
  coralSoft: '#FBE9E8',
  blueSoft: '#E7F0F7',
  blueText: '#244B6A',
  amber: '#F4B942',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardRoot: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  kicker: {
    color: colors.muted,
    fontSize: 14,
    textTransform: 'capitalize',
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    marginTop: 2,
  },
  scoreBadge: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    height: 66,
    justifyContent: 'center',
    width: 72,
  },
  scoreNumber: {
    color: colors.tealDark,
    fontSize: 22,
    fontWeight: '800',
  },
  scoreLabel: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 1,
  },
  actionPanel: {
    alignItems: 'center',
    backgroundColor: colors.teal,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    minHeight: 112,
    padding: 14,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  actionCopy: {
    flex: 1,
  },
  sectionEyebrow: {
    color: '#DDF3F0',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  actionDetail: {
    color: '#DDF3F0',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  iconButtonDark: {
    alignItems: 'center',
    backgroundColor: colors.tealDark,
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  inputPanel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
    padding: 14,
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  segmentedControl: {
    backgroundColor: colors.background,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    padding: 4,
  },
  priorityPill: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  priorityPillSelected: {
    backgroundColor: colors.ink,
  },
  priorityText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  priorityTextSelected: {
    color: '#FFFFFF',
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  inputRowCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.coral,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  addButtonSecondary: {
    alignItems: 'center',
    backgroundColor: '#DDF3F0',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeaderTight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  listStack: {
    gap: 10,
    marginBottom: 18,
  },
  rowCard: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  checkButton: {
    alignItems: 'center',
    backgroundColor: '#EEF8F7',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  checkButtonDone: {
    backgroundColor: colors.teal,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  doneText: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.coralSoft,
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 64,
    justifyContent: 'center',
    marginBottom: 18,
    padding: 12,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  weekPanel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 14,
  },
  weekGrid: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 94,
    justifyContent: 'space-between',
    paddingBottom: 8,
    paddingTop: 8,
  },
  dayCellToday: {
    borderColor: colors.teal,
  },
  dayLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  dayLabelToday: {
    color: colors.tealDark,
  },
  dayTrack: {
    backgroundColor: '#DCE3EA',
    borderRadius: 8,
    height: 54,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 12,
  },
  dayFill: {
    backgroundColor: colors.amber,
    borderRadius: 8,
    minHeight: 2,
    width: '100%',
  },
  closePanel: {
    alignItems: 'center',
    backgroundColor: colors.blueSoft,
    borderColor: '#C7D9E8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    padding: 12,
  },
  closeIcon: {
    alignItems: 'center',
    backgroundColor: '#D7E8F4',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  closeText: {
    flex: 1,
  },
  closeTitle: {
    color: colors.blueText,
    fontSize: 16,
    fontWeight: '800',
  },
  closeMeta: {
    color: colors.blueText,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  carryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  pressed: {
    opacity: 0.78,
  },
});
