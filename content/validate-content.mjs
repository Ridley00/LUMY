import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const curriculumPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(directory, 'curriculum.json');
const curriculum = JSON.parse(fs.readFileSync(curriculumPath, 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(directory, 'content-report.json'), 'utf8'));
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const sameNumber = (left, right) => typeof left === 'number' && Number.isFinite(left) && Math.abs(left - right) < 1e-10;
const allIds = new Set();
const exercises = new Map();

check(curriculum.version === 1, 'Версия схемы должна быть 1.');
check(Array.isArray(curriculum.levels) && curriculum.levels.length === 12, 'Нужны 12 уровней от 0 до 11.');
check(Array.isArray(curriculum.lessons), 'lessons должен быть массивом.');
const levelIds = new Set();
for (const level of curriculum.levels ?? []) {
  check(Number.isInteger(level.id) && level.id >= 0 && level.id <= 11, 'Некорректный уровень: ' + level.id);
  check(!levelIds.has(level.id), 'Повтор уровня: ' + level.id);
  levelIds.add(level.id);
  check(hasText(level.label) && hasText(level.scope), 'У уровня отсутствует название или описание: ' + level.id);
}
for (const lesson of curriculum.lessons ?? []) {
  check(/^[a-z0-9-]+$/.test(lesson.id), 'Некорректный ID урока: ' + lesson.id);
  check(!allIds.has(lesson.id), 'Повтор ID: ' + lesson.id);
  allIds.add(lesson.id);
  check(levelIds.has(lesson.level), 'Урок с неизвестным уровнем: ' + lesson.id);
  for (const field of ['subject', 'title', 'summary']) check(hasText(lesson[field]), lesson.id + ': отсутствует ' + field);
  for (const field of ['theory', 'competencies']) {
    check(Array.isArray(lesson[field]) && lesson[field].length > 0 && lesson[field].every(hasText), lesson.id + ': некорректный ' + field);
  }
  check(Array.isArray(lesson.sourceIds) && lesson.sourceIds.every(hasText), lesson.id + ': некорректный sourceIds');
  check(Array.isArray(lesson.exercises) && lesson.exercises.length >= 3, lesson.id + ': требуется минимум три задания.');
  for (const exercise of lesson.exercises ?? []) {
    const id = exercise.id;
    check(/^[a-z0-9-]+$/.test(id), 'Некорректный ID задания: ' + id);
    check(!allIds.has(id), 'Повтор ID: ' + id);
    allIds.add(id);
    exercises.set(id, exercise);
    check(['number', 'choice', 'text'].includes(exercise.type), id + ': неизвестный тип.');
    check(hasText(exercise.prompt), id + ': нет условия.');
    for (const field of ['hints', 'solution']) {
      check(Array.isArray(exercise[field]) && exercise[field].length > 0 && exercise[field].every(hasText), id + ': некорректный ' + field);
    }
    if (exercise.type === 'number') {
      check(typeof exercise.answer === 'number' && Number.isFinite(exercise.answer), id + ': числовой ответ должен быть конечным числом.');
      check(exercise.tolerance === 0, id + ': набор использует точные числовые ответы.');
    } else {
      check(hasText(exercise.answer), id + ': ответ должен быть непустой строкой.');
    }
    if (exercise.type === 'choice') {
      check(Array.isArray(exercise.options) && exercise.options.length >= 3 && exercise.options.every(hasText), id + ': нужны варианты ответа.');
      check(new Set(exercise.options).size === exercise.options.length, id + ': повтор вариантов.');
      check(exercise.options.includes(exercise.answer), id + ': правильного ответа нет среди вариантов.');
    }
    if (exercise.accepted !== undefined) check(Array.isArray(exercise.accepted) && exercise.accepted.every(hasText), id + ': некорректные допустимые ответы.');
    if (exercise.tags !== undefined) {
      check(Array.isArray(exercise.tags) && exercise.tags.every(tag => ['ВПР', 'ОГЭ', 'ЕГЭ'].includes(tag)), id + ': неизвестная экзаменационная метка.');
      for (const tag of exercise.tags) {
        const expectedLevel = { 'ВПР': 4, 'ОГЭ': 9, 'ЕГЭ': 11 }[tag];
        check(lesson.level === expectedLevel, id + ': метка набора не совпадает с уровнем.');
      }
    }
    const answerText = String(exercise.answer).trim().toLocaleLowerCase('ru');
    check(!exercise.hints.some(hint => hint.trim().toLocaleLowerCase('ru') === answerText), id + ': подсказка совпадает с готовым ответом.');
  }
}
check(!JSON.stringify(curriculum).includes('\u2014'), 'В тексте обнаружено длинное тире.');

// Независимый пересчёт числовых задач. Значения здесь не считываются из answer.
// Для языковых заданий используются явные подсчёты, а не имитация проверки свободной речи.
const numericOracles = new Map([
  ['pre-count-1', 3 + 2],
  ['pre-count-2', 6 - 1],
  ['pre-compare-2', 5 - 3],
  ['g1-add-1', 7 + 6],
  ['g1-add-2', 15 - 7],
  ['g1-add-3', 9 + 4],
  ['g1-syllables-1', [...'лиса'].filter(letter => 'аеёиоуыэюя'.includes(letter)).length],
  ['g2-multiplication-1', 5 * 2],
  ['g2-multiplication-2', 18 / 3],
  ['g2-multiplication-3', 4 * 3],
  ['g2-instruction-2', ['первый треугольник', 'второй треугольник'].length],
  ['g3-multiply-1', 16 * 4],
  ['g3-multiply-2', 3 * 12 - 5],
  ['g3-multiply-3', 48 / 6],
  ['g3-fractions-1', 24 / 4],
  ['g3-fractions-2', 18 / 3],
  ['g3-perimeter-1', 2 * (7 + 3)],
  ['g3-perimeter-2', 4 * 6],
  ['g3-perimeter-3', 4 + 5 + 6],
  ['g4-calculation-1', 240 - 36 / 4],
  ['g4-calculation-2', 4 * 35 + 80],
  ['g4-calculation-3', (125 + 75) * 3],
  ['g4-area-1', 8 * 5],
  ['g4-area-2', 3 * 100 + 25],
  ['g4-area-3', 2 * (9 + 4)],
  ['g4-fractions-1', 24 * 3 / 4],
  ['g4-fractions-2', 60 * 2 / 3],
  ['g4-fractions-3', 28 / 4],
  ['g4-reading-1', (13 * 60 + 30) - 12 * 60],
  ['g6-percent-1', 350 * 20 / 100],
  ['g6-percent-2', 30 / 40 * 100],
  ['g6-percent-3', 500 * (1 - 10 / 100)],
  ['g6-data-1', 12 - 4],
  ['g6-data-2', 9 - 7],
  ['g7-equations-1', (31 - 7) / 4],
  ['g7-equations-2', 35 / 5 + 2],
  ['g7-equations-3', (170 - 20) / 3],
  ['g7-speed-1', 36 / 3],
  ['g7-speed-2', 4 * 15],
  ['g7-speed-3', 72 * 1000 / 3600],
  ['g8-pythagoras-1', Math.sqrt(6 ** 2 + 8 ** 2)],
  ['g8-pythagoras-2', Math.sqrt(13 ** 2 - 5 ** 2)],
  ['g8-pythagoras-3', Math.sqrt(81)],
  ['g8-chemistry-1', Number('CO2'.match(/O(\d+)/)[1])],
  ['g8-chemistry-2', 3 * 2],
  ['g8-chemistry-3', (2 * 2) / 2],
  ['g9-math-exam-1', (7 - Math.sqrt(7 ** 2 - 4 * 12)) / 2],
  ['g9-math-exam-2', 3 / (3 + 7)],
  ['g9-math-exam-3', 2 * 4 - 5],
  ['g9-russian-exam-1', ['дождь закончился', 'мы открыли'].length],
  ['g9-electricity-1', 12 / 4],
  ['g9-electricity-2', 6 * 2],
  ['g9-electricity-3', 10 / 0.5],
  ['g10-probability-1', 0.5 * 0.5],
  ['g10-probability-2', (3 - 1) / (3 + 2 - 1)],
  ['g10-statistics-1', [4, 6, 8, 10].reduce((sum, n) => sum + n, 0) / 4],
  ['g10-statistics-2', [2, 3, 4, 5, 36].sort((a, b) => a - b)[2]],
  ['g10-statistics-3', (6 + 8) / 2],
  ['g11-derivative-1', 2 * 2 + 3],
  ['g11-derivative-2', 6 / 2],
  ['g11-derivative-3', 2 * 4],
  ['g11-energy-1', 600 / 20],
  ['g11-energy-2', 750 / 1000 * 100],
  ['g11-energy-3', 50 * (2 * 60)],
]);
for (const [id, exercise] of exercises) {
  if (exercise.type !== 'number') continue;
  check(numericOracles.has(id), id + ': нет независимого пересчёта числового ответа.');
  if (numericOracles.has(id)) check(sameNumber(exercise.answer, numericOracles.get(id)), id + ': неверный числовой ответ.');
}
for (const id of numericOracles.keys()) check(exercises.has(id), id + ': проверка ссылается на отсутствующее задание.');

const fractionOracles = new Map([
  ['g5-fractions-1', 2 / 9 + 4 / 9],
  ['g5-fractions-2', 1 / 2 + 1 / 6],
  ['g5-fractions-3', 5 / 8 - 1 / 8],
]);
for (const [id, expected] of fractionOracles) {
  const exercise = exercises.get(id);
  check(Boolean(exercise), id + ': задание на дроби отсутствует.');
  if (!exercise) continue;
  const parts = exercise.answer.match(/^(\d+)\/(\d+)$/);
  check(parts && sameNumber(Number(parts[1]) / Number(parts[2]), expected), id + ': неверная дробь в ответе.');
}

// Подстановка решений проверяет уравнения отдельно от способа их получения.
check(4 * exercises.get('g7-equations-1').answer + 7 === 31, 'Не проходит подстановка в 4x + 7 = 31.');
check(5 * (exercises.get('g7-equations-2').answer - 2) === 35, 'Не проходит подстановка в 5(x - 2) = 35.');
const root = exercises.get('g9-math-exam-1').answer;
check(root * root - 7 * root + 12 === 0 && root < 7 - root, 'Указан не меньший корень квадратного уравнения.');
check(exercises.get('g8-chemistry-3').answer * 1 === 2, 'Не сохранено число атомов кислорода в реакции.');

check(report.counts.levels === curriculum.levels.length, 'Отчёт: число уровней устарело.');
check(report.counts.lessons === curriculum.lessons.length, 'Отчёт: число уроков устарело.');
check(report.counts.exercises === exercises.size, 'Отчёт: число заданий устарело.');
for (const type of ['choice', 'number', 'text']) {
  const count = [...exercises.values()].filter(exercise => exercise.type === type).length;
  check(report.counts.byType[type] === count, 'Отчёт: неверный счётчик типа ' + type);
}
for (const tag of ['ВПР', 'ОГЭ', 'ЕГЭ']) {
  const count = [...exercises.values()].filter(exercise => exercise.tags?.includes(tag)).length;
  check(report.counts.byExamTag[tag] === count, 'Отчёт: неверный счётчик ' + tag);
}
for (const level of curriculum.levels) {
  const lessons = curriculum.lessons.filter(lesson => lesson.level === level.id);
  const coverage = report.coverageByLevel.find(item => item.level === level.id);
  check(lessons.length > 0, 'Пустой уровень: ' + level.id);
  check(coverage && coverage.lessons === lessons.length, 'Отчёт: неверный счётчик уроков уровня ' + level.id);
  check(coverage && coverage.exercises === lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0), 'Отчёт: неверный счётчик заданий уровня ' + level.id);
}

const result = {
  ok: errors.length === 0,
  levels: curriculum.levels.length,
  lessons: curriculum.lessons.length,
  exercises: exercises.size,
  numericAnswersRecomputed: numericOracles.size,
  fractionChoiceAnswersRecomputed: fractionOracles.size,
  limits: 'Проверка подтверждает структуру и указанные вычисления; не заменяет независимую предметную экспертизу, проверку педагогической эффективности или защиту родительского доступа.',
  errors,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (errors.length) process.exitCode = 1;

