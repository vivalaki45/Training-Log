/**
 * Workout Logger - GitHub Pages script.js
 *
 * 役割：
 * - GASからExercise Master DBの種目一覧を取得
 * - 前回記録を表示
 * - 今回のトレーニングを入力
 * - GASへPOSTしてNotionに登録
 */

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwBo79Nq-fAgvkIAnncSnJW2u-f4o3rG_JhpESt0DqCdnwSijb6bQ71Se53PrwJS_vK/exec';

const workoutDateInput = document.getElementById('workoutDate');
const bodyPartSelect = document.getElementById('bodyPart');
const sessionMemoInput = document.getElementById('sessionMemo');
const loadExercisesButton = document.getElementById('loadExercisesButton');
const exerciseList = document.getElementById('exerciseList');
const statusMessage = document.getElementById('statusMessage');
const submitButton = document.getElementById('submitButton');
const submitMessage = document.getElementById('submitMessage');

const exerciseTemplate = document.getElementById('exerciseTemplate');
const setTemplate = document.getElementById('setTemplate');

let loadedExercises = [];

/**
 * 初期化
 */
function init() {
  workoutDateInput.value = getTodayIsoDate();

  loadExercisesButton.addEventListener('click', handleLoadExercises);
  submitButton.addEventListener('click', handleSubmitWorkout);
}

/**
 * 今日の日付を yyyy-MM-dd で返す
 */
function getTodayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * ステータスメッセージ表示
 */
function setStatus(message) {
  statusMessage.textContent = message;
}

/**
 * 送信メッセージ表示
 */
function setSubmitMessage(message, type) {
  submitMessage.textContent = message || '';
  submitMessage.className = 'submit-message';

  if (type) {
    submitMessage.classList.add(type);
  }
}

/**
 * GASへGETリクエスト
 */
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

/**
 * GASへPOSTリクエスト
 */
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

/**
 * 種目読み込み
 */
async function handleLoadExercises() {
  const bodyPart = bodyPartSelect.value;

  if (!bodyPart) {
    alert('部位を選択してください。');
    return;
  }

  setStatus('種目と前回記録を読み込み中...');
  setSubmitMessage('', '');
  submitButton.disabled = true;
  exerciseList.innerHTML = '';

  try {
    const data = await getFromGas({
      action: 'getExercisesWithLastWorkout',
      bodyPart: bodyPart
    });

    loadedExercises = data.exercises || [];

    if (loadedExercises.length === 0) {
      setStatus('この部位の種目がありません。Exercise Master DBを確認してください。');
      return;
    }

    renderExercises(loadedExercises);
    setStatus(`${bodyPart}の種目を読み込みました。`);
    submitButton.disabled = false;

  } catch (error) {
    console.error(error);
    setStatus('読み込みに失敗しました: ' + error.message);
  }
}

/**
 * 種目一覧を描画
 */
function renderExercises(exercises) {
  exerciseList.innerHTML = '';

  exercises.forEach((exercise) => {
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
      addSetRow(setsContainer, {
        weight: '',
        reps: '',
        success: true
      });
      addSetRow(setsContainer, {
        weight: '',
        reps: '',
        success: true
      });
      addSetRow(setsContainer, {
        weight: '',
        reps: '',
        success: true
      });
    }

    addSetButton.addEventListener('click', () => {
      addSetRow(setsContainer, {
        weight: '',
        reps: '',
        success: true
      });
    });

    exerciseList.appendChild(node);
  });
}

/**
 * 前回記録HTML
 */
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
    const failText = success ? '' : ' 失敗';

    return `
      <div class="last-set-line${failClass}">
        <span class="last-set-label">${setNo}set:</span>
        <span>${weight}kg × ${reps}回${failText}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="last-workout-date">日付：${date}</div>
    ${lines}
  `;
}

/**
 * 前回記録を今回入力欄の初期値に使う
 *
 * 方針：
 * - weightは前回と同じ値を入れる
 * - repsも前回値を入れる
 * - 成功はチェックあり
 */
function getPreviousSetsForInitialInput(lastWorkout) {
  if (!lastWorkout || !lastWorkout.sets) {
    return [];
  }

  return lastWorkout.sets.map((set) => {
    return {
      weight: set.weight ?? '',
      reps: set.reps ?? '',
      success: true
    };
  });
}

/**
 * セット行追加
 */
function addSetRow(container, initialValue) {
  const node = setTemplate.content.cloneNode(true);
  const row = node.querySelector('.set-row');

  const weightInput = node.querySelector('.set-weight');
  const repsInput = node.querySelector('.set-reps');
  const successInput = node.querySelector('.set-success');
  const removeButton = node.querySelector('.remove-set-button');

  weightInput.value = initialValue.weight ?? '';
  repsInput.value = initialValue.reps ?? '';
  successInput.checked = initialValue.success !== false;

  removeButton.addEventListener('click', () => {
    row.remove();
    refreshSetNumbers(container);
  });

  container.appendChild(node);
  refreshSetNumbers(container);
}

/**
 * セット番号を振り直す
 */
function refreshSetNumbers(container) {
  const rows = container.querySelectorAll('.set-row');

  rows.forEach((row, index) => {
    const setNumber = row.querySelector('.set-number');
    setNumber.textContent = `${index + 1}`;
  });
}

/**
 * 入力内容を集める
 */
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
    const enabled = card.querySelector('.exercise-enabled').checked;

    if (!enabled) {
      return;
    }

    const exerciseId = card.dataset.exerciseId;
    const exerciseName = card.dataset.exerciseName;
    const exerciseMemo = card.querySelector('.exercise-memo').value.trim();

    const rows = card.querySelectorAll('.set-row');

    rows.forEach((row, index) => {
      const weightValue = row.querySelector('.set-weight').value;
      const repsValue = row.querySelector('.set-reps').value;
      const success = row.querySelector('.set-success').checked;

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

/**
 * Notion登録
 */
async function handleSubmitWorkout() {
  if (!confirm('この内容でNotionに登録しますか？')) {
    return;
  }

  submitButton.disabled = true;
  setSubmitMessage('登録中...', '');

  try {
    const payload = collectWorkoutPayload();
    const result = await postToGas(payload);

    console.log(result);

    setSubmitMessage('登録しました。Notionを確認してください。', 'success');

  } catch (error) {
    console.error(error);
    setSubmitMessage('登録に失敗しました: ' + error.message, 'error');
    submitButton.disabled = false;
  }
}

init();
