/**
 * Workout Logger - GitHub Pages script.js
 */

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwBo79Nq-fAgvkIAnncSnJW2u-f4o3rG_JhpESt0DqCdnwSijb6bQ71Se53PrwJS_vK/exec';

const workoutDateInput = document.getElementById('workoutDate');
const bodyPartSelect = document.getElementById('bodyPart');
const sessionMemoInput = document.getElementById('sessionMemo');
const loadExercisesButton = document.getElementById('loadExercisesButton');
const addSelectedExercisesButton = document.getElementById('addSelectedExercisesButton');
const exercisePicker = document.getElementById('exercisePicker');
const exerciseList = document.getElementById('exerciseList');
const statusMessage = document.getElementById('statusMessage');
const submitButton = document.getElementById('submitButton');
const submitMessage = document.getElementById('submitMessage');

const pickerItemTemplate = document.getElementById('pickerItemTemplate');
const exerciseTemplate = document.getElementById('exerciseTemplate');
const setTemplate = document.getElementById('setTemplate');

let loadedExercises = [];

function init() {
  workoutDateInput.value = getTodayIsoDate();

  loadExercisesButton.addEventListener('click', handleLoadExercises);
  addSelectedExercisesButton.addEventListener('click', handleAddSelectedExercises);
  submitButton.addEventListener('click', handleSubmitWorkout);
}

function getTodayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function setSubmitMessage(message, type) {
  submitMessage.textContent = message || '';
  submitMessage.className = 'submit-message';

  if (type) {
    submitMessage.classList.add(type);
  }
}

async function getFromGas(params) {
  const url = new URL(GAS_WEB_APP_URL);

  Object.keys(params).forEach((key) => {
    url.searchParams.set(key, params[key]);
  });

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'GAS API error');
  }

  return data;
}

async function postToGas(payload) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'GAS API error');
  }

  return data;
}

async function handleLoadExercises() {
  const bodyPart = bodyPartSelect.value;

  if (!bodyPart) {
    alert('部位を選択してください。');
    return;
  }

  setStatus('種目を読み込み中...');
  setSubmitMessage('', '');
  exercisePicker.innerHTML = '';
  exerciseList.innerHTML = '';
  submitButton.disabled = true;
  addSelectedExercisesButton.disabled = true;

  try {
    const data = await getFromGas({
      action: 'getExercisesWithLastWorkout',
      bodyPart: bodyPart
    });

    loadedExercises = data.exercises || [];

    if (loadedExercises.length === 0) {
      setStatus('この部位の種目がありません。');
      return;
    }

    renderExercisePicker(loadedExercises);
    setStatus(`${bodyPart}の種目を読み込みました。今日やる種目を選んでください。`);
    addSelectedExercisesButton.disabled = false;

  } catch (error) {
    console.error(error);
    setStatus('読み込みに失敗しました: ' + error.message);
  }
}

function renderExercisePicker(exercises) {
  exercisePicker.innerHTML = '';

  exercises.forEach((exercise) => {
    const node = pickerItemTemplate.content.cloneNode(true);
    const item = node.querySelector('.picker-item');
    const checkbox = node.querySelector('.picker-checkbox');

    item.dataset.exerciseId = exercise.id;
    checkbox.value = exercise.id;

    node.querySelector('.picker-name').textContent = exercise.name;
    node.querySelector('.picker-category').textContent =
      [exercise.bodyPart, exercise.category].filter(Boolean).join(' / ');

    exercisePicker.appendChild(node);
  });
}

function handleAddSelectedExercises() {
  const checked = exercisePicker.querySelectorAll('.picker-checkbox:checked');

  if (checked.length === 0) {
    alert('今日やる種目を選んでください。');
    return;
  }

  checked.forEach((checkbox) => {
    const exerciseId = checkbox.value;
    const exercise = loadedExercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      return;
    }

    if (isExerciseAlreadyAdded(exercise.id)) {
      return;
    }

    renderExerciseCard(exercise);
  });

  submitButton.disabled = exerciseList.querySelectorAll('.exercise-card').length === 0;
}

function isExerciseAlreadyAdded(exerciseId) {
  return Boolean(
    exerciseList.querySelector(`.exercise-card[data-exercise-id="${exerciseId}"]`)
  );
}

function renderExerciseCard(exercise) {
  const node = exerciseTemplate.content.cloneNode(true);
  const card = node.querySelector('.exercise-card');

  card.dataset.exerciseId = exercise.id;
  card.dataset.exerciseName = exercise.name;

  node.querySelector('.exercise-name').textContent = exercise.name;
  node.querySelector('.exercise-category').textContent =
    [exercise.bodyPart, exercise.category].filter(Boolean).join(' / ');

  const lastWorkoutContent = node.querySelector('.last-workout-content');
  lastWorkoutContent.innerHTML = renderLastWorkoutHtml(exercise.lastWorkout);

  const setsContainer = node.querySelector('.sets-container');
  const addSetButton = node.querySelector('.add-set-button');
  const moveUpButton = node.querySelector('.move-up-button');
  const moveDownButton = node.querySelector('.move-down-button');
  const removeExerciseButton = node.querySelector('.remove-exercise-button');

  const previousSets = getPreviousSetsForInitialInput(exercise.lastWorkout);

  if (previousSets.length > 0) {
    previousSets.forEach((set) => {
      addSetRow(setsContainer, {
        weight: set.weight,
        reps: set.reps,
        success: true
      });
    });
  } else {
    addSetRow(setsContainer, { weight: '', reps: '', success: true });
    addSetRow(setsContainer, { weight: '', reps: '', success: true });
    addSetRow(setsContainer, { weight: '', reps: '', success: true });
  }

  addSetButton.addEventListener('click', () => {
    addSetRow(setsContainer, { weight: '', reps: '', success: true });
  });

  moveUpButton.addEventListener('click', () => {
    const previous = card.previousElementSibling;

    if (previous) {
      exerciseList.insertBefore(card, previous);
    }
  });

  moveDownButton.addEventListener('click', () => {
    const next = card.nextElementSibling;

    if (next) {
      exerciseList.insertBefore(next, card);
    }
  });

  removeExerciseButton.addEventListener('click', () => {
    card.remove();
    submitButton.disabled = exerciseList.querySelectorAll('.exercise-card').length === 0;
  });

  exerciseList.appendChild(node);
}

function renderLastWorkoutHtml(lastWorkout) {
  if (!lastWorkout || !lastWorkout.sets || lastWorkout.sets.length === 0) {
    return '<div class="last-workout-empty">前回記録なし</div>';
  }

  const date = lastWorkout.lastDate || '';

  const lines = lastWorkout.sets.map((set) => {
    const setNo = set.setNo || '';
    const weight = set.weight ?? '';
    const reps = set.reps ?? '';
    const success = set.success;

    const failClass = success ? '' : ' last-set-fail';
    const mark = success ? '○' : '×';

    return `
      <div class="last-set-line${failClass}">
        <span class="last-set-label">${setNo}set:</span>
        <span>${weight}kg × ${reps}回 ${mark}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="last-workout-date">日付：${date}</div>
    ${lines}
  `;
}

function getPreviousSetsForInitialInput(lastWorkout) {
  if (!lastWorkout || !lastWorkout.sets) {
    return [];
  }

  return lastWorkout.sets.map((set) => {
    return {
      weight: set.weight ?? '',
      reps: set.reps ?? '',
      success: set.success !== false
    };
  });
}

function addSetRow(container, initialValue) {
  const node = setTemplate.content.cloneNode(true);
  const row = node.querySelector('.set-row');

  const weightInput = node.querySelector('.set-weight');
  const repsInput = node.querySelector('.set-reps');
  const removeButton = node.querySelector('.remove-set-button');
  const resultButtons = node.querySelectorAll('.result-button');

  weightInput.value = initialValue.weight ?? '';
  repsInput.value = initialValue.reps ?? '';
  row.dataset.success = initialValue.success === false ? 'false' : 'true';

  updateResultButtons(row);

  resultButtons.forEach((button) => {
    button.addEventListener('click', () => {
      row.dataset.success = button.dataset.success;
      updateResultButtons(row);
    });
  });

  removeButton.addEventListener('click', () => {
    row.remove();
    refreshSetNumbers(container);
  });

  container.appendChild(node);
  refreshSetNumbers(container);
}

function updateResultButtons(row) {
  const success = row.dataset.success !== 'false';
  const successButton = row.querySelector('.result-button.success');
  const failButton = row.querySelector('.result-button.fail');

  successButton.classList.toggle('active', success);
  failButton.classList.toggle('active', !success);
}

function refreshSetNumbers(container) {
  const rows = container.querySelectorAll('.set-row');

  rows.forEach((row, index) => {
    const setNumber = row.querySelector('.set-number');
    setNumber.textContent = `${index + 1}`;
  });
}

function collectWorkoutPayload() {
  const date = workoutDateInput.value;
  const bodyPart = bodyPartSelect.value;
  const memo = sessionMemoInput.value.trim();

  if (!date) {
    throw new Error('日付を入力してください。');
  }

  if (!bodyPart) {
    throw new Error('部位を選択してください。');
  }

  const sessionName = `${date.replaceAll('-', '/')} ${bodyPart}`;
  const sets = [];

  const cards = exerciseList.querySelectorAll('.exercise-card');

  cards.forEach((card) => {
    const exerciseId = card.dataset.exerciseId;
    const exerciseName = card.dataset.exerciseName;
    const exerciseMemo = card.querySelector('.exercise-memo').value.trim();

    const rows = card.querySelectorAll('.set-row');

    rows.forEach((row, index) => {
      const weightValue = row.querySelector('.set-weight').value;
      const repsValue = row.querySelector('.set-reps').value;
      const success = row.dataset.success !== 'false';

      if (weightValue === '' && repsValue === '') {
        return;
      }

      const weight = Number(weightValue);
      const reps = Number(repsValue);

      if (Number.isNaN(weight) || Number.isNaN(reps)) {
        return;
      }

      sets.push({
        exerciseId: exerciseId,
        exerciseName: exerciseName,
        setNo: index + 1,
        weight: weight,
        reps: reps,
        success: success,
        memo: exerciseMemo
      });
    });
  });

  if (sets.length === 0) {
    throw new Error('登録するセットがありません。');
  }

  return {
    date: date,
    bodyPart: bodyPart,
    sessionName: sessionName,
    memo: memo,
    sets: sets
  };
}

async function handleSubmitWorkout() {
  if (!confirm('この内容でNotionに保存しますか？')) {
    return;
  }

  submitButton.disabled = true;
  setSubmitMessage('保存中...', '');

  try {
    const payload = collectWorkoutPayload();
    const result = await postToGas(payload);

    console.log(result);

    setSubmitMessage('保存しました。', 'success');

  } catch (error) {
    console.error(error);
    setSubmitMessage('保存に失敗しました: ' + error.message, 'error');
    submitButton.disabled = false;
  }
}

init();
