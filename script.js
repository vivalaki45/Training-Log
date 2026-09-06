/**
 * Workout Logger - GitHub Pages script.js
 *
 * 機能：
 * - 記録 / カレンダーのタブ切り替え
 * - 部位別の種目読み込み
 * - 種目ごとの直近記録表示
 * - 数値入力欄をタップしたら全選択
 * - 入力途中データの自動下書き保存
 * - ページ再読み込み後の下書き復元
 * - Notionへのトレーニング保存
 * - 保存成功後の入力内容・下書き削除
 * - 月曜始まりの月カレンダー表示
 * - カレンダー内で予定を追加
 * - 予定と実績を分けて表示
 * - カレンダーの日付を押して予定日を選択
 */

const GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbwBo79Nq-fAgvkIAnncSnJW2u-f4o3rG_JhpESt0DqCdnwSijb6bQ71Se53PrwJS_vK/exec';

const DRAFT_STORAGE_KEY = 'workoutLoggerDraftV1';

/* =========================
   記録画面
========================= */

const workoutDateInput = document.getElementById('workoutDate');
const bodyPartSelect = document.getElementById('bodyPart');
const sessionMemoInput = document.getElementById('sessionMemo');

const loadExercisesButton =
  document.getElementById('loadExercisesButton');

const addSelectedExercisesButton =
  document.getElementById('addSelectedExercisesButton');

const exercisePicker =
  document.getElementById('exercisePicker');

const exerciseList =
  document.getElementById('exerciseList');

const statusMessage =
  document.getElementById('statusMessage');

const submitButton =
  document.getElementById('submitButton');

const submitMessage =
  document.getElementById('submitMessage');

/* =========================
   テンプレート
========================= */

const pickerItemTemplate =
  document.getElementById('pickerItemTemplate');

const exerciseTemplate =
  document.getElementById('exerciseTemplate');

const setTemplate =
  document.getElementById('setTemplate');

/* =========================
   タブ
========================= */

const tabButtons =
  document.querySelectorAll('.tab-button');

const logTab =
  document.getElementById('logTab');

const calendarTab =
  document.getElementById('calendarTab');

/* =========================
   カレンダー
========================= */

const prevMonthButton =
  document.getElementById('prevMonthButton');

const nextMonthButton =
  document.getElementById('nextMonthButton');

const todayMonthButton =
  document.getElementById('todayMonthButton');

const calendarTitle =
  document.getElementById('calendarTitle');

const calendarStatus =
  document.getElementById('calendarStatus');

const calendarGrid =
  document.getElementById('calendarGrid');

/* =========================
   予定フォーム
========================= */

const togglePlanFormButton =
  document.getElementById('togglePlanFormButton');

const planForm =
  document.getElementById('planForm');

const planDateInput =
  document.getElementById('planDate');

const planBodyPartSelect =
  document.getElementById('planBodyPart');

const planMemoInput =
  document.getElementById('planMemo');

const savePlanButton =
  document.getElementById('savePlanButton');

const planMessage =
  document.getElementById('planMessage');

/* =========================
   状態
========================= */

let loadedExercises = [];
let currentCalendarDate = new Date();

let isRestoringDraft = false;
let isClearingAfterSave = false;
let draftSaveTimer = null;

/* =========================
   初期化
========================= */

function init() {
  const today = getTodayIsoDate();

  workoutDateInput.value = today;
  planDateInput.value = today;

  loadExercisesButton.addEventListener(
    'click',
    handleLoadExercises
  );

  addSelectedExercisesButton.addEventListener(
    'click',
    handleAddSelectedExercises
  );

  submitButton.addEventListener(
    'click',
    handleSubmitWorkout
  );

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });
  });

  prevMonthButton.addEventListener('click', () => {
    currentCalendarDate = new Date(
      currentCalendarDate.getFullYear(),
      currentCalendarDate.getMonth() - 1,
      1
    );

    loadCalendar();
  });

  nextMonthButton.addEventListener('click', () => {
    currentCalendarDate = new Date(
      currentCalendarDate.getFullYear(),
      currentCalendarDate.getMonth() + 1,
      1
    );

    loadCalendar();
  });

  todayMonthButton.addEventListener('click', () => {
    currentCalendarDate = new Date();
    loadCalendar();
  });

  togglePlanFormButton.addEventListener(
    'click',
    togglePlanForm
  );

  savePlanButton.addEventListener(
    'click',
    handleSavePlan
  );

  setupDraftAutoSave();
  restoreDraftOnOpen();
}

/* =========================
   タブ切り替え
========================= */

function switchTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.tab === tabName
    );
  });

  logTab.classList.toggle(
    'active',
    tabName === 'log'
  );

  calendarTab.classList.toggle(
    'active',
    tabName === 'calendar'
  );

  if (tabName === 'calendar') {
    loadCalendar();
  }
}

/* =========================
   共通処理
========================= */

function getTodayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  const localDate = new Date(
    now.getTime() - offset * 60 * 1000
  );

  return localDate.toISOString().slice(0, 10);
}

function setStatus(message) {
  statusMessage.textContent = message || '';
}

function setSubmitMessage(message, type) {
  submitMessage.textContent = message || '';
  submitMessage.className = 'submit-message';

  if (type) {
    submitMessage.classList.add(type);
  }
}

function setPlanMessage(message, type) {
  planMessage.textContent = message || '';
  planMessage.className = 'plan-message';

  if (type) {
    planMessage.classList.add(type);
  }
}

/* =========================
   GAS通信
========================= */

async function getFromGas(params) {
  const url = new URL(GAS_WEB_APP_URL);

  Object.keys(params).forEach((key) => {
    url.searchParams.set(key, params[key]);
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(
      `通信エラーが発生しました。HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      data.error || 'GAS API error'
    );
  }

  return data;
}

async function postToGas(payload) {
  const response = await fetch(
    GAS_WEB_APP_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    throw new Error(
      `通信エラーが発生しました。HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(
      data.error || 'GAS API error'
    );
  }

  return data;
}

/* =========================
   種目読み込み
========================= */

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

  loadedExercises = [];

  submitButton.disabled = true;
  addSelectedExercisesButton.disabled = true;

  try {
    const data = await getFromGas({
      action: 'getExercisesWithLastWorkout',
      bodyPart: bodyPart
    });

    loadedExercises = data.exercises || [];

    if (loadedExercises.length === 0) {
      setStatus(
        'この部位に登録されている種目がありません。'
      );

      saveDraftDebounced();
      return;
    }

    renderExercisePicker(loadedExercises);

    setStatus(
      `${bodyPart}の種目を読み込みました。今日やる種目を選んでください。`
    );

    addSelectedExercisesButton.disabled = false;

    saveDraftDebounced();

  } catch (error) {
    console.error(error);

    setStatus(
      '読み込みに失敗しました: ' + error.message
    );

    saveDraftDebounced();
  }
}

/* =========================
   種目選択
========================= */

function renderExercisePicker(exercises) {
  exercisePicker.innerHTML = '';

  exercises.forEach((exercise) => {
    const node =
      pickerItemTemplate.content.cloneNode(true);

    const item =
      node.querySelector('.picker-item');

    const checkbox =
      node.querySelector('.picker-checkbox');

    const name =
      node.querySelector('.picker-name');

    const category =
      node.querySelector('.picker-category');

    item.dataset.exerciseId = exercise.id;
    checkbox.value = exercise.id;

    name.textContent = exercise.name;

    category.textContent = [
      exercise.bodyPart,
      exercise.category
    ]
      .filter(Boolean)
      .join(' / ');

    checkbox.addEventListener(
      'change',
      saveDraftDebounced
    );

    exercisePicker.appendChild(node);
  });
}

function handleAddSelectedExercises() {
  const checked = exercisePicker.querySelectorAll(
    '.picker-checkbox:checked'
  );

  if (checked.length === 0) {
    alert('今日やる種目を選んでください。');
    return;
  }

  checked.forEach((checkbox) => {
    const exerciseId = checkbox.value;

    const exercise = loadedExercises.find(
      (item) => item.id === exerciseId
    );

    if (!exercise) {
      return;
    }

    if (isExerciseAlreadyAdded(exercise.id)) {
      return;
    }

    renderExerciseCard(exercise);
  });

  submitButton.disabled =
    exerciseList.querySelectorAll('.exercise-card')
      .length === 0;

  saveDraftDebounced();
}

function isExerciseAlreadyAdded(exerciseId) {
  return Boolean(
    exerciseList.querySelector(
      `.exercise-card[data-exercise-id="${exerciseId}"]`
    )
  );
}

/* =========================
   種目カード
========================= */

function renderExerciseCard(
  exercise,
  savedExerciseData
) {
  const node =
    exerciseTemplate.content.cloneNode(true);

  const card =
    node.querySelector('.exercise-card');

  const exerciseName =
    node.querySelector('.exercise-name');

  const exerciseCategory =
    node.querySelector('.exercise-category');

  const lastWorkoutContent =
    node.querySelector('.last-workout-content');

  const setsContainer =
    node.querySelector('.sets-container');

  const addSetButton =
    node.querySelector('.add-set-button');

  const moveUpButton =
    node.querySelector('.move-up-button');

  const moveDownButton =
    node.querySelector('.move-down-button');

  const removeExerciseButton =
    node.querySelector('.remove-exercise-button');

  const exerciseMemoInput =
    node.querySelector('.exercise-memo');

  card.dataset.exerciseId = exercise.id;
  card.dataset.exerciseName = exercise.name;

  exerciseName.textContent = exercise.name;

  exerciseCategory.textContent = [
    exercise.bodyPart,
    exercise.category
  ]
    .filter(Boolean)
    .join(' / ');

  lastWorkoutContent.innerHTML =
    renderLastWorkoutHtml(exercise.lastWorkout);

  if (
    savedExerciseData &&
    savedExerciseData.memo
  ) {
    exerciseMemoInput.value =
      savedExerciseData.memo;
  }

  const savedSets =
    savedExerciseData &&
    Array.isArray(savedExerciseData.sets)
      ? savedExerciseData.sets
      : null;

  if (savedSets && savedSets.length > 0) {
    savedSets.forEach((set) => {
      addSetRow(setsContainer, {
        weight: set.weight,
        reps: set.reps,
        success: set.success
      });
    });

  } else {
    const previousSets =
      getPreviousSetsForInitialInput(
        exercise.lastWorkout
      );

    if (previousSets.length > 0) {
      previousSets.forEach((set) => {
        addSetRow(setsContainer, {
          weight: set.weight,
          reps: set.reps,
          success: set.success
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
  }

  addSetButton.addEventListener('click', () => {
    addSetRow(setsContainer, {
      weight: '',
      reps: '',
      success: true
    });

    saveDraftDebounced();
  });

  moveUpButton.addEventListener('click', () => {
    const previous = card.previousElementSibling;

    if (previous) {
      exerciseList.insertBefore(
        card,
        previous
      );

      saveDraftDebounced();
    }
  });

  moveDownButton.addEventListener('click', () => {
    const next = card.nextElementSibling;

    if (next) {
      exerciseList.insertBefore(
        next,
        card
      );

      saveDraftDebounced();
    }
  });

  removeExerciseButton.addEventListener(
    'click',
    () => {
      card.remove();

      submitButton.disabled =
        exerciseList.querySelectorAll(
          '.exercise-card'
        ).length === 0;

      saveDraftDebounced();
    }
  );

  exerciseMemoInput.addEventListener(
    'input',
    saveDraftDebounced
  );

  exerciseList.appendChild(node);
}

/* =========================
   直近記録
========================= */

function renderLastWorkoutHtml(lastWorkout) {
  if (
    !lastWorkout ||
    !Array.isArray(lastWorkout.sets) ||
    lastWorkout.sets.length === 0
  ) {
    return `
      <div class="last-workout-empty">
        直近記録なし
      </div>
    `;
  }

  const date = lastWorkout.lastDate || '';

  const lines = lastWorkout.sets
    .map((set) => {
      const setNo = set.setNo || '';
      const weight = set.weight ?? '';
      const reps = set.reps ?? '';
      const success = set.success !== false;

      const failClass =
        success ? '' : ' last-set-fail';

      const mark =
        success ? 'GOOD' : 'FAIL';

      return `
        <div class="last-set-line${failClass}">
          <span class="last-set-label">
            ${setNo}set:
          </span>
          <span>
            ${weight}kg × ${reps}回 ${mark}
          </span>
        </div>
      `;
    })
    .join('');

  return `
    <div class="last-workout-date">
      日付：${date}
    </div>
    ${lines}
  `;
}

function getPreviousSetsForInitialInput(
  lastWorkout
) {
  if (
    !lastWorkout ||
    !Array.isArray(lastWorkout.sets)
  ) {
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

/* =========================
   セット行
========================= */

function addSetRow(container, initialValue) {
  const node =
    setTemplate.content.cloneNode(true);

  const row =
    node.querySelector('.set-row');

  const weightInput =
    node.querySelector('.set-weight');

  const repsInput =
    node.querySelector('.set-reps');

  const removeButton =
    node.querySelector('.remove-set-button');

  const resultButtons =
    node.querySelectorAll('.result-button');

  weightInput.value =
    initialValue.weight ?? '';

  repsInput.value =
    initialValue.reps ?? '';

  row.dataset.success =
    initialValue.success === false
      ? 'false'
      : 'true';

  enableSelectAllOnFocus(weightInput);
  enableSelectAllOnFocus(repsInput);

  weightInput.addEventListener(
    'input',
    saveDraftDebounced
  );

  repsInput.addEventListener(
    'input',
    saveDraftDebounced
  );

  updateResultButtons(row);

  resultButtons.forEach((button) => {
    button.addEventListener('click', () => {
      row.dataset.success =
        button.dataset.success;

      updateResultButtons(row);
      saveDraftDebounced();
    });
  });

  removeButton.addEventListener('click', () => {
    row.remove();
    refreshSetNumbers(container);
    saveDraftDebounced();
  });

  container.appendChild(node);
  refreshSetNumbers(container);
}

function enableSelectAllOnFocus(input) {
  input.addEventListener('focus', () => {
    setTimeout(() => {
      input.select();
    }, 0);
  });

  input.addEventListener(
    'mouseup',
    (event) => {
      event.preventDefault();
    }
  );

  input.addEventListener('touchend', () => {
    setTimeout(() => {
      input.select();
    }, 0);
  });
}

function updateResultButtons(row) {
  const success =
    row.dataset.success !== 'false';

  const successButton =
    row.querySelector(
      '.result-button.success'
    );

  const failButton =
    row.querySelector(
      '.result-button.fail'
    );

  successButton.classList.toggle(
    'active',
    success
  );

  failButton.classList.toggle(
    'active',
    !success
  );
}

function refreshSetNumbers(container) {
  const rows =
    container.querySelectorAll('.set-row');

  rows.forEach((row, index) => {
    const setNumber =
      row.querySelector('.set-number');

    setNumber.textContent =
      String(index + 1);
  });
}

/* =========================
   Notion保存用データ
========================= */

function collectWorkoutPayload() {
  const date = workoutDateInput.value;
  const bodyPart = bodyPartSelect.value;

  const memo =
    sessionMemoInput.value.trim();

  if (!date) {
    throw new Error(
      '日付を入力してください。'
    );
  }

  if (!bodyPart) {
    throw new Error(
      '部位を選択してください。'
    );
  }

  const sessionName =
    `${date.replaceAll('-', '/')} ${bodyPart}`;

  const sets = [];

  const cards =
    exerciseList.querySelectorAll(
      '.exercise-card'
    );

  cards.forEach((card) => {
    const exerciseId =
      card.dataset.exerciseId;

    const exerciseName =
      card.dataset.exerciseName;

    const exerciseMemo =
      card
        .querySelector('.exercise-memo')
        .value
        .trim();

    const rows =
      card.querySelectorAll('.set-row');

    rows.forEach((row, index) => {
      const weightValue =
        row.querySelector('.set-weight').value;

      const repsValue =
        row.querySelector('.set-reps').value;

      const success =
        row.dataset.success !== 'false';

      if (
        weightValue === '' &&
        repsValue === ''
      ) {
        return;
      }

      if (
        weightValue === '' ||
        repsValue === ''
      ) {
        return;
      }

      const weight = Number(weightValue);
      const reps = Number(repsValue);

      if (
        Number.isNaN(weight) ||
        Number.isNaN(reps)
      ) {
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
    throw new Error(
      '登録するセットがありません。'
    );
  }

  return {
    date: date,
    bodyPart: bodyPart,
    sessionName: sessionName,
    memo: memo,
    sets: sets
  };
}

/* =========================
   Notionにトレーニング保存
========================= */

async function handleSubmitWorkout() {
  const shouldSave = confirm(
    'この内容でNotionに保存しますか？'
  );

  if (!shouldSave) {
    return;
  }

  submitButton.disabled = true;

  setSubmitMessage(
    '保存中...',
    ''
  );

  try {
    const payload =
      collectWorkoutPayload();

    const result =
      await postToGas(payload);

    console.log(result);

    /*
     * 保存成功後に、下書きが再保存されないように
     * 自動保存を一時停止する
     */
    isClearingAfterSave = true;

    /*
     * 予約中の自動保存をキャンセル
     */
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }

    /*
     * localStorageの下書きを削除
     */
    clearDraft();

    /*
     * 画面上の入力データを初期化
     */
    resetWorkoutForm();

    /*
     * 初期化完了後に自動保存を再開
     */
    isClearingAfterSave = false;

    setSubmitMessage(
      'Notionに保存しました。入力データと下書きを削除しました。',
      'success'
    );

    await loadCalendar();

  } catch (error) {
    console.error(error);

    isClearingAfterSave = false;

    setSubmitMessage(
      '保存に失敗しました: ' + error.message,
      'error'
    );

    submitButton.disabled = false;

    /*
     * 保存失敗時は入力内容を下書きに残す
     */
    saveDraftDebounced();
  }
}

/* =========================
   保存後の画面初期化
========================= */

function resetWorkoutForm() {
  workoutDateInput.value =
    getTodayIsoDate();

  bodyPartSelect.value = '';
  sessionMemoInput.value = '';

  exercisePicker.innerHTML = '';
  exerciseList.innerHTML = '';

  loadedExercises = [];

  addSelectedExercisesButton.disabled = true;
  submitButton.disabled = true;

  setStatus(
    '部位を選択して種目を読み込んでください。'
  );
}

/* =========================
   予定フォーム
========================= */

function togglePlanForm() {
  const isHidden =
    planForm.classList.contains('hidden');

  planForm.classList.toggle(
    'hidden',
    !isHidden
  );

  togglePlanFormButton.textContent =
    isHidden
      ? '予定を閉じる'
      : '予定を追加';

  if (isHidden) {
    if (!planDateInput.value) {
      planDateInput.value =
        getTodayIsoDate();
    }

    setPlanMessage('', '');
  }
}

function openPlanFormForDate(dateString) {
  planDateInput.value = dateString;

  if (
    planForm.classList.contains('hidden')
  ) {
    planForm.classList.remove('hidden');

    togglePlanFormButton.textContent =
      '予定を閉じる';
  }

  setPlanMessage(
    '予定日を選択しました。部位を選んで保存してください。',
    ''
  );

  planBodyPartSelect.focus();

  planForm.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

/* =========================
   予定をNotionに保存
========================= */

async function handleSavePlan() {
  const date = planDateInput.value;
  const bodyPart =
    planBodyPartSelect.value;

  const memo =
    planMemoInput.value.trim();

  if (!date) {
    alert('予定日を入力してください。');
    return;
  }

  if (!bodyPart) {
    alert('部位を選択してください。');
    return;
  }

  savePlanButton.disabled = true;

  setPlanMessage(
    '予定を保存中...',
    ''
  );

  try {
    const result = await postToGas({
      action: 'createPlan',
      date: date,
      bodyPart: bodyPart,
      memo: memo
    });

    console.log(result);

    setPlanMessage(
      '予定を保存しました。',
      'success'
    );

    planMemoInput.value = '';
    planBodyPartSelect.value = '';

    currentCalendarDate = new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      1
    );

    await loadCalendar();

  } catch (error) {
    console.error(error);

    setPlanMessage(
      '予定の保存に失敗しました: ' +
        error.message,
      'error'
    );

  } finally {
    savePlanButton.disabled = false;
  }
}

/* =========================
   下書き自動保存
========================= */

function setupDraftAutoSave() {
  workoutDateInput.addEventListener(
    'change',
    saveDraftDebounced
  );

  bodyPartSelect.addEventListener(
    'change',
    saveDraftDebounced
  );

  sessionMemoInput.addEventListener(
    'input',
    saveDraftDebounced
  );

  window.addEventListener(
    'beforeunload',
    () => {
      saveDraftNow();
    }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState === 'hidden'
      ) {
        saveDraftNow();
      }
    }
  );
}

function saveDraftDebounced() {
  if (
    isRestoringDraft ||
    isClearingAfterSave
  ) {
    return;
  }

  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
  }

  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    saveDraftNow();
  }, 300);
}

function saveDraftNow() {
  if (
    isRestoringDraft ||
    isClearingAfterSave
  ) {
    return;
  }

  const draft = collectDraftState();

  /*
   * 日付しか入っていない初期状態は
   * 下書きとして保存しない
   */
  if (!hasMeaningfulDraftData(draft)) {
    clearDraft();
    return;
  }

  try {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify(draft)
    );

  } catch (error) {
    console.error(
      '下書き保存に失敗しました',
      error
    );
  }
}

function hasMeaningfulDraftData(draft) {
  const hasBodyPart =
    Boolean(draft.bodyPart);

  const hasSessionMemo =
    Boolean(
      draft.sessionMemo &&
      draft.sessionMemo.trim()
    );

  const hasSelectedExercises =
    Array.isArray(draft.selectedPickerIds) &&
    draft.selectedPickerIds.length > 0;

  const hasExerciseCards =
    Array.isArray(draft.exerciseCards) &&
    draft.exerciseCards.length > 0;

  return (
    hasBodyPart ||
    hasSessionMemo ||
    hasSelectedExercises ||
    hasExerciseCards
  );
}

/* =========================
   下書きデータ収集
========================= */

function collectDraftState() {
  const selectedPickerIds =
    Array.from(
      exercisePicker.querySelectorAll(
        '.picker-checkbox:checked'
      )
    ).map((checkbox) => checkbox.value);

  const exerciseCards =
    Array.from(
      exerciseList.querySelectorAll(
        '.exercise-card'
      )
    ).map((card) => {
      const rows =
        Array.from(
          card.querySelectorAll('.set-row')
        ).map((row) => {
          return {
            weight:
              row.querySelector(
                '.set-weight'
              ).value,

            reps:
              row.querySelector(
                '.set-reps'
              ).value,

            success:
              row.dataset.success !== 'false'
          };
        });

      return {
        exerciseId:
          card.dataset.exerciseId,

        exerciseName:
          card.dataset.exerciseName,

        memo:
          card.querySelector(
            '.exercise-memo'
          ).value,

        sets: rows
      };
    });

  return {
    savedAt: new Date().toISOString(),
    date: workoutDateInput.value,
    bodyPart: bodyPartSelect.value,
    sessionMemo: sessionMemoInput.value,
    loadedExercises: loadedExercises,
    selectedPickerIds: selectedPickerIds,
    exerciseCards: exerciseCards
  };
}

/* =========================
   下書き復元
========================= */

async function restoreDraftOnOpen() {
  const draft = loadDraft();

  if (!draft) {
    return;
  }

  /*
   * 空データや不正な下書きだった場合は削除
   */
  if (!hasMeaningfulDraftData(draft)) {
    clearDraft();
    return;
  }

  const savedText = draft.savedAt
    ? formatSavedAtText(draft.savedAt)
    : '';

  const shouldRestore = confirm(
    '保存前の下書きがあります。復元しますか？' +
      (
        savedText
          ? '\n\n保存日時: ' + savedText
          : ''
      )
  );

  if (!shouldRestore) {
    const shouldDelete = confirm(
      'この下書きを削除しますか？'
    );

    if (shouldDelete) {
      clearDraft();
    }

    return;
  }

  await restoreDraft(draft);
}

function loadDraft() {
  try {
    const text =
      localStorage.getItem(
        DRAFT_STORAGE_KEY
      );

    if (!text) {
      return null;
    }

    return JSON.parse(text);

  } catch (error) {
    console.error(
      '下書き読み込みに失敗しました',
      error
    );

    /*
     * JSONが壊れている場合は削除
     */
    clearDraft();

    return null;
  }
}

async function restoreDraft(draft) {
  isRestoringDraft = true;

  try {
    workoutDateInput.value =
      draft.date || getTodayIsoDate();

    bodyPartSelect.value =
      draft.bodyPart || '';

    sessionMemoInput.value =
      draft.sessionMemo || '';

    exercisePicker.innerHTML = '';
    exerciseList.innerHTML = '';

    loadedExercises = [];

    submitButton.disabled = true;
    addSelectedExercisesButton.disabled = true;

    if (
      Array.isArray(draft.loadedExercises) &&
      draft.loadedExercises.length > 0
    ) {
      loadedExercises =
        draft.loadedExercises;

    } else if (draft.bodyPart) {
      const data = await getFromGas({
        action: 'getExercisesWithLastWorkout',
        bodyPart: draft.bodyPart
      });

      loadedExercises =
        data.exercises || [];
    }

    if (loadedExercises.length > 0) {
      renderExercisePicker(
        loadedExercises
      );

      addSelectedExercisesButton.disabled =
        false;

      if (
        Array.isArray(
          draft.selectedPickerIds
        )
      ) {
        draft.selectedPickerIds.forEach(
          (id) => {
            const checkbox =
              exercisePicker.querySelector(
                `.picker-checkbox[value="${id}"]`
              );

            if (checkbox) {
              checkbox.checked = true;
            }
          }
        );
      }
    }

    if (
      Array.isArray(draft.exerciseCards)
    ) {
      draft.exerciseCards.forEach(
        (savedExerciseData) => {
          let exercise =
            loadedExercises.find(
              (item) =>
                item.id ===
                savedExerciseData.exerciseId
            );

          if (!exercise) {
            exercise = {
              id:
                savedExerciseData.exerciseId,

              name:
                savedExerciseData.exerciseName ||
                '種目',

              bodyPart:
                draft.bodyPart || '',

              category: '',
              order: null,
              lastWorkout: null
            };
          }

          renderExerciseCard(
            exercise,
            savedExerciseData
          );
        }
      );
    }

    submitButton.disabled =
      exerciseList.querySelectorAll(
        '.exercise-card'
      ).length === 0;

    if (draft.bodyPart) {
      setStatus(
        `${draft.bodyPart}の下書きを復元しました。`
      );

    } else {
      setStatus(
        '下書きを復元しました。'
      );
    }

  } catch (error) {
    console.error(error);

    setStatus(
      '下書き復元に失敗しました: ' +
        error.message
    );

  } finally {
    isRestoringDraft = false;
  }
}

/* =========================
   下書き削除
========================= */

function clearDraft() {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }

  try {
    localStorage.removeItem(
      DRAFT_STORAGE_KEY
    );

  } catch (error) {
    console.error(
      '下書き削除に失敗しました',
      error
    );
  }
}

function formatSavedAtText(isoString) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return isoString;
  }

  const year =
    date.getFullYear();

  const month =
    String(date.getMonth() + 1)
      .padStart(2, '0');

  const day =
    String(date.getDate())
      .padStart(2, '0');

  const hour =
    String(date.getHours())
      .padStart(2, '0');

  const minute =
    String(date.getMinutes())
      .padStart(2, '0');

  return (
    `${year}/${month}/${day} ` +
    `${hour}:${minute}`
  );
}

/* =========================
   カレンダー読み込み
========================= */

async function loadCalendar() {
  const year =
    currentCalendarDate.getFullYear();

  const month =
    currentCalendarDate.getMonth() + 1;

  calendarTitle.textContent =
    `${year}年${month}月`;

  calendarStatus.textContent =
    '読み込み中...';

  calendarGrid.innerHTML = '';

  try {
    const data = await getFromGas({
      action: 'getMonthlySessions',
      year: year,
      month: month
    });

    const sessions =
      data.sessions || [];

    renderCalendar(
      year,
      month,
      sessions
    );

    if (sessions.length === 0) {
      calendarStatus.textContent =
        'この月の予定・記録はありません。';

    } else {
      const actualCount =
        sessions.filter(
          (session) =>
            getSessionType(session) ===
            'actual'
        ).length;

      const planCount =
        sessions.filter(
          (session) =>
            getSessionType(session) ===
            'plan'
        ).length;

      calendarStatus.textContent =
        `実績 ${actualCount}件 / ` +
        `予定 ${planCount}件`;
    }

  } catch (error) {
    console.error(error);

    calendarStatus.textContent =
      '読み込みに失敗しました: ' +
      error.message;
  }
}

/* =========================
   カレンダー描画
========================= */

function renderCalendar(
  year,
  month,
  sessions
) {
  calendarGrid.innerHTML = '';

  const sessionsByDate =
    groupSessionsByDate(sessions);

  const firstDate =
    new Date(year, month - 1, 1);

  const lastDate =
    new Date(year, month, 0);

  const firstDayIndex =
    getMondayStartDayIndex(firstDate);

  const daysInMonth =
    lastDate.getDate();

  for (
    let index = 0;
    index < firstDayIndex;
    index += 1
  ) {
    const emptyCell =
      document.createElement('div');

    emptyCell.className =
      'calendar-day empty';

    calendarGrid.appendChild(
      emptyCell
    );
  }

  for (
    let day = 1;
    day <= daysInMonth;
    day += 1
  ) {
    const dateString =
      formatCalendarDate(
        year,
        month,
        day
      );

    const daySessions =
      sessionsByDate[dateString] || [];

    const cell =
      document.createElement('button');

    cell.type = 'button';

    cell.className =
      'calendar-day calendar-day-button';

    cell.dataset.date = dateString;

    if (
      dateString === getTodayIsoDate()
    ) {
      cell.classList.add('today');
    }

    cell.addEventListener('click', () => {
      openPlanFormForDate(dateString);
    });

    const dayNumber =
      document.createElement('div');

    dayNumber.className =
      'calendar-day-number';

    dayNumber.textContent =
      String(day);

    const badges =
      document.createElement('div');

    badges.className =
      'calendar-badges';

    const badgeItems =
      buildCalendarBadgeItems(
        daySessions
      );

    badgeItems.forEach((item) => {
      const badge =
        document.createElement('span');

      badge.className = [
        'body-badge',
        getBodyPartClass(item.bodyPart),
        item.type
      ].join(' ');

      badge.textContent =
        getBodyPartShortName(
          item.bodyPart
        );

      badge.title =
        `${
          item.type === 'actual'
            ? '実績'
            : '予定'
        }：${item.bodyPart}`;

      badges.appendChild(badge);
    });

    cell.appendChild(dayNumber);
    cell.appendChild(badges);

    calendarGrid.appendChild(cell);
  }
}

/* =========================
   カレンダーデータ処理
========================= */

function buildCalendarBadgeItems(
  sessions
) {
  const map = {};

  sessions.forEach((session) => {
    const bodyPart =
      session.bodyPart || '';

    if (!bodyPart) {
      return;
    }

    const type =
      getSessionType(session);

    const key = bodyPart;

    if (!map[key]) {
      map[key] = {
        bodyPart: bodyPart,
        type: type
      };

      return;
    }

    /*
     * 同じ部位で予定と実績が両方ある場合は
     * 実績を優先する
     */
    if (
      map[key].type === 'plan' &&
      type === 'actual'
    ) {
      map[key].type = 'actual';
    }
  });

  return Object.keys(map).map(
    (key) => map[key]
  );
}

function getSessionType(session) {
  if (session.type === 'actual') {
    return 'actual';
  }

  if (session.type === 'plan') {
    return 'plan';
  }

  if (session.status === 'Done') {
    return 'actual';
  }

  return 'plan';
}

function groupSessionsByDate(sessions) {
  const grouped = {};

  sessions.forEach((session) => {
    if (!session.date) {
      return;
    }

    if (!grouped[session.date]) {
      grouped[session.date] = [];
    }

    grouped[session.date].push(
      session
    );
  });

  return grouped;
}

/* =========================
   カレンダー補助
========================= */

function getMondayStartDayIndex(date) {
  const day = date.getDay();

  /*
   * JavaScript：
   * 日曜=0、月曜=1
   *
   * 表示：
   * 月曜=0、日曜=6
   */
  if (day === 0) {
    return 6;
  }

  return day - 1;
}

function formatCalendarDate(
  year,
  month,
  day
) {
  const yearText =
    String(year).padStart(4, '0');

  const monthText =
    String(month).padStart(2, '0');

  const dayText =
    String(day).padStart(2, '0');

  return (
    `${yearText}-` +
    `${monthText}-` +
    `${dayText}`
  );
}

function getBodyPartShortName(bodyPart) {
  const map = {
    '胸': '胸',
    '背中': '背',
    '脚': '脚',
    '腕': '腕',
    '肩': '肩',
    '腹': '腹',
    '全身': '全'
  };

  return (
    map[bodyPart] ||
    bodyPart.slice(0, 1)
  );
}

function getBodyPartClass(bodyPart) {
  const map = {
    '胸': 'body-chest',
    '背中': 'body-back',
    '脚': 'body-legs',
    '腕': 'body-arms',
    '肩': 'body-shoulders',
    '腹': 'body-abs',
    '全身': 'body-full'
  };

  return (
    map[bodyPart] ||
    'body-full'
  );
}

/* =========================
   実行
========================= */

init();
