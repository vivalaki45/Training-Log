const GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbwBo79Nq-fAgvkIAnncSnJW2u-f4o3rG_JhpESt0DqCdnwSijb6bQ71Se53PrwJS_vK/exec';

const DRAFT_STORAGE_KEY = 'workoutLoggerDraftV1';

const $ = (id) => document.getElementById(id);

const workoutDateInput = $('workoutDate');
const bodyPartSelect = $('bodyPart');
const sessionMemoInput = $('sessionMemo');

const loadExercisesButton = $('loadExercisesButton');
const addSelectedExercisesButton =
  $('addSelectedExercisesButton');

const exercisePicker = $('exercisePicker');
const exerciseList = $('exerciseList');
const statusMessage = $('statusMessage');

const submitButton = $('submitButton');
const submitMessage = $('submitMessage');

const pickerItemTemplate = $('pickerItemTemplate');
const exerciseTemplate = $('exerciseTemplate');
const setTemplate = $('setTemplate');
const subsetTemplate = $('subsetTemplate');

const tabButtons =
  document.querySelectorAll('.tab-button');

const logTab = $('logTab');
const calendarTab = $('calendarTab');

const prevMonthButton = $('prevMonthButton');
const nextMonthButton = $('nextMonthButton');
const todayMonthButton = $('todayMonthButton');

const calendarTitle = $('calendarTitle');
const calendarStatus = $('calendarStatus');
const calendarGrid = $('calendarGrid');

const togglePlanFormButton =
  $('togglePlanFormButton');

const planForm = $('planForm');
const planDateInput = $('planDate');
const planBodyPartSelect = $('planBodyPart');
const planMemoInput = $('planMemo');
const savePlanButton = $('savePlanButton');
const planMessage = $('planMessage');

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
   タブ
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
   共通
========================= */

function getTodayIsoDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();

  const localDate = new Date(
    now.getTime() - offset * 60 * 1000
  );

  return localDate.toISOString().slice(0, 10);
}

function setStatus(text) {
  statusMessage.textContent = text || '';
}

function setMessage(element, text, type) {
  element.textContent = text || '';

  element.className =
    element === submitMessage
      ? 'submit-message'
      : 'plan-message';

  if (type) {
    element.classList.add(type);
  }
}

/* =========================
   GAS通信
========================= */

async function getFromGas(params) {
  const url = new URL(GAS_WEB_APP_URL);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `通信エラー HTTP ${response.status}`
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
        'Content-Type':
          'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    throw new Error(
      `通信エラー HTTP ${response.status}`
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
  setMessage(submitMessage, '', '');

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
      return;
    }

    renderExercisePicker(loadedExercises);

    setStatus(
      `${bodyPart}の種目を読み込みました。` +
      '今日やる種目を選んでください。'
    );

    addSelectedExercisesButton.disabled = false;
    saveDraftDebounced();

  } catch (error) {
    console.error(error);

    setStatus(
      '読み込みに失敗しました: ' +
      error.message
    );
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

    item.dataset.exerciseId = exercise.id;
    checkbox.value = exercise.id;

    node.querySelector(
      '.picker-name'
    ).textContent = exercise.name;

    node.querySelector(
      '.picker-category'
    ).textContent = [
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
  const checked =
    exercisePicker.querySelectorAll(
      '.picker-checkbox:checked'
    );

  if (checked.length === 0) {
    alert('今日やる種目を選んでください。');
    return;
  }

  checked.forEach((checkbox) => {
    const exercise =
      loadedExercises.find(
        (item) =>
          item.id === checkbox.value
      );

    if (
      exercise &&
      !isExerciseAlreadyAdded(exercise.id)
    ) {
      renderExerciseCard(exercise);
    }
  });

  submitButton.disabled =
    !exerciseList.querySelector(
      '.exercise-card'
    );

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

  const setsContainer =
    node.querySelector('.sets-container');

  card.dataset.exerciseId = exercise.id;
  card.dataset.exerciseName = exercise.name;

  node.querySelector(
    '.exercise-name'
  ).textContent = exercise.name;

  node.querySelector(
    '.exercise-category'
  ).textContent = [
    exercise.bodyPart,
    exercise.category
  ]
    .filter(Boolean)
    .join(' / ');

  node.querySelector(
    '.last-workout-content'
  ).innerHTML =
    renderLastWorkoutHtml(
      exercise.lastWorkout
    );

  const memoInput =
    node.querySelector('.exercise-memo');

  memoInput.value =
    savedExerciseData?.memo || '';

  memoInput.addEventListener(
    'input',
    saveDraftDebounced
  );

  const initialSets =
    savedExerciseData?.sets?.length
      ? savedExerciseData.sets
      : groupPreviousSets(
          exercise.lastWorkout
        );

  if (initialSets.length > 0) {
    initialSets.forEach((set) => {
      addSetBlock(
        setsContainer,
        set
      );
    });

  } else {
    for (let index = 0; index < 3; index += 1) {
      addSetBlock(
        setsContainer,
        {
          weight: '',
          reps: '',
          success: true,
          subsets: []
        }
      );
    }
  }

  node.querySelector(
    '.add-set-button'
  ).addEventListener('click', () => {
    addSetBlock(
      setsContainer,
      {
        weight: '',
        reps: '',
        success: true,
        subsets: []
      }
    );

    saveDraftDebounced();
  });

  node.querySelector(
    '.move-up-button'
  ).addEventListener('click', () => {
    const previous =
      card.previousElementSibling;

    if (previous) {
      exerciseList.insertBefore(
        card,
        previous
      );
    }

    saveDraftDebounced();
  });

  node.querySelector(
    '.move-down-button'
  ).addEventListener('click', () => {
    const next =
      card.nextElementSibling;

    if (next) {
      exerciseList.insertBefore(
        next,
        card
      );
    }

    saveDraftDebounced();
  });

  node.querySelector(
    '.remove-exercise-button'
  ).addEventListener('click', () => {
    card.remove();

    submitButton.disabled =
      !exerciseList.querySelector(
        '.exercise-card'
      );

    saveDraftDebounced();
  });

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
    return (
      '<div class="last-workout-empty">' +
      '直近記録なし' +
      '</div>'
    );
  }

  const lines = lastWorkout.sets
    .map((set) => {
      const downSet = isDownSet(set);

      const label = downSet
        ? `${formatSetNo(set.setNo)} ダウン`
        : `${set.setNo}set`;

      const mark =
        set.success === false
          ? 'FAIL'
          : 'GOOD';

      const failClass =
        set.success === false
          ? ' last-set-fail'
          : '';

      return `
        <div class="last-set-line${failClass}">
          <span class="last-set-label">
            ${label}:
          </span>
          <span>
            ${set.weight ?? ''}kg ×
            ${set.reps ?? ''}回
            ${mark}
          </span>
        </div>
      `;
    })
    .join('');

  return `
    <div class="last-workout-date">
      日付：${lastWorkout.lastDate || ''}
    </div>
    ${lines}
  `;
}

function isDownSet(set) {
  return (
    !Number.isInteger(
      Number(set.setNo)
    ) ||
    String(set.memo || '')
      .includes('【ダウンセット】')
  );
}

function formatSetNo(setNo) {
  const number = Number(setNo);
  const parent = Math.floor(number);

  const child = Math.round(
    (number - parent) * 10
  );

  return `${parent}-${child || 1}`;
}

function groupPreviousSets(lastWorkout) {
  if (
    !lastWorkout ||
    !Array.isArray(lastWorkout.sets)
  ) {
    return [];
  }

  const normalSets = [];
  const setMap = {};

  lastWorkout.sets.forEach((set) => {
    const setNumber =
      Number(set.setNo) || 1;

    const parentNumber =
      Math.floor(setNumber);

    const childNumber =
      Math.round(
        (setNumber - parentNumber) * 10
      );

    if (
      childNumber > 0 ||
      isDownSet(set)
    ) {
      if (!setMap[parentNumber]) {
        const emptyParent = {
          weight: '',
          reps: '',
          success: true,
          subsets: []
        };

        normalSets.push(emptyParent);
        setMap[parentNumber] = emptyParent;
      }

      setMap[parentNumber].subsets.push({
        weight: set.weight ?? '',
        reps: set.reps ?? ''
      });

    } else {
      const parentSet = {
        weight: set.weight ?? '',
        reps: set.reps ?? '',
        success:
          set.success !== false,
        subsets: []
      };

      normalSets.push(parentSet);
      setMap[parentNumber] = parentSet;
    }
  });

  return normalSets;
}

/* =========================
   通常セット
========================= */

function addSetBlock(
  container,
  initialValue = {}
) {
  const node =
    setTemplate.content.cloneNode(true);

  const block =
    node.querySelector('.set-block');

  const row =
    node.querySelector('.set-row');

  const weightInput =
    node.querySelector('.set-weight');

  const repsInput =
    node.querySelector('.set-reps');

  const subsetsContainer =
    node.querySelector(
      '.subsets-container'
    );

  weightInput.value =
    initialValue.weight ?? '';

  repsInput.value =
    initialValue.reps ?? '';

  row.dataset.success =
    initialValue.success === false
      ? 'false'
      : 'true';

  [weightInput, repsInput]
    .forEach((input) => {
      enableSelectAllOnFocus(input);

      input.addEventListener(
        'input',
        saveDraftDebounced
      );
    });

  updateResultButtons(row);

  node.querySelectorAll(
    '.result-button'
  ).forEach((button) => {
    button.addEventListener(
      'click',
      () => {
        row.dataset.success =
          button.dataset.success;

        updateResultButtons(row);
        saveDraftDebounced();
      }
    );
  });

  node.querySelector(
    '.remove-set-button'
  ).addEventListener('click', () => {
    block.remove();
    refreshSetNumbers(container);
    saveDraftDebounced();
  });

  node.querySelector(
    '.add-subset-button'
  ).addEventListener('click', () => {
    addSubsetRow(
      subsetsContainer,
      {}
    );

    saveDraftDebounced();
  });

  const savedSubsets =
    Array.isArray(initialValue.subsets)
      ? initialValue.subsets
      : [];

  savedSubsets.forEach((subset) => {
    addSubsetRow(
      subsetsContainer,
      subset
    );
  });

  container.appendChild(node);
  refreshSetNumbers(container);
}

/* =========================
   ダウンセット
========================= */

function addSubsetRow(
  container,
  initialValue = {}
) {
  const node =
    subsetTemplate.content.cloneNode(true);

  const row =
    node.querySelector('.subset-row');

  const weightInput =
    node.querySelector('.subset-weight');

  const repsInput =
    node.querySelector('.subset-reps');

  weightInput.value =
    initialValue.weight ?? '';

  repsInput.value =
    initialValue.reps ?? '';

  [weightInput, repsInput]
    .forEach((input) => {
      enableSelectAllOnFocus(input);

      input.addEventListener(
        'input',
        saveDraftDebounced
      );
    });

  node.querySelector(
    '.remove-subset-button'
  ).addEventListener('click', () => {
    row.remove();
    refreshSubsetNumbers(container);
    saveDraftDebounced();
  });

  container.appendChild(node);
  refreshSubsetNumbers(container);
}

function refreshSetNumbers(container) {
  const blocks =
    container.querySelectorAll(
      ':scope > .set-block'
    );

  blocks.forEach((block, index) => {
    block.querySelector(
      '.set-number'
    ).textContent =
      String(index + 1);
  });
}

function refreshSubsetNumbers(container) {
  const rows =
    container.querySelectorAll(
      ':scope > .subset-row'
    );

  rows.forEach((row, index) => {
    row.querySelector(
      '.subset-number'
    ).textContent =
      `${index + 1}段目`;
  });
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

  input.addEventListener(
    'touchend',
    () => {
      setTimeout(() => {
        input.select();
      }, 0);
    }
  );
}

function updateResultButtons(row) {
  const success =
    row.dataset.success !== 'false';

  row.querySelector(
    '.result-button.success'
  ).classList.toggle(
    'active',
    success
  );

  row.querySelector(
    '.result-button.fail'
  ).classList.toggle(
    'active',
    !success
  );
}

/* =========================
   保存データ収集
========================= */

function collectWorkoutPayload() {
  const date = workoutDateInput.value;
  const bodyPart = bodyPartSelect.value;

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

  const sets = [];

  exerciseList.querySelectorAll(
    '.exercise-card'
  ).forEach((card) => {
    const exerciseMemo =
      card.querySelector(
        '.exercise-memo'
      ).value.trim();

    const setBlocks =
      card.querySelectorAll(
        '.sets-container > .set-block'
      );

    setBlocks.forEach(
      (block, index) => {
        const parentSetNo = index + 1;

        const normalSet = readInputPair(
          block.querySelector(
            '.set-weight'
          ),
          block.querySelector(
            '.set-reps'
          )
        );

        if (normalSet) {
          sets.push({
            exerciseId:
              card.dataset.exerciseId,

            exerciseName:
              card.dataset.exerciseName,

            setNo: parentSetNo,

            weight:
              normalSet.weight,

            reps:
              normalSet.reps,

            success:
              block.querySelector(
                '.set-row'
              ).dataset.success !== 'false',

            memo: exerciseMemo
          });
        }

        const subsets =
          block.querySelectorAll(
            '.subset-row'
          );

        subsets.forEach(
          (subset, subsetIndex) => {
            const pair = readInputPair(
              subset.querySelector(
                '.subset-weight'
              ),
              subset.querySelector(
                '.subset-reps'
              )
            );

            if (!pair) {
              return;
            }

            sets.push({
              exerciseId:
                card.dataset.exerciseId,

              exerciseName:
                card.dataset.exerciseName,

              setNo: Number(
                `${parentSetNo}.${subsetIndex + 1}`
              ),

              weight: pair.weight,
              reps: pair.reps,
              success: true,

              memo:
                `【ダウンセット】${exerciseMemo}`
            });
          }
        );
      }
    );
  });

  if (sets.length === 0) {
    throw new Error(
      '登録するセットがありません。'
    );
  }

  return {
    date: date,
    bodyPart: bodyPart,

    sessionName:
      `${date.replaceAll('-', '/')} ${bodyPart}`,

    memo:
      sessionMemoInput.value.trim(),

    sets: sets
  };
}

function readInputPair(
  weightInput,
  repsInput
) {
  const weightText =
    weightInput.value;

  const repsText =
    repsInput.value;

  if (
    weightText === '' &&
    repsText === ''
  ) {
    return null;
  }

  if (
    weightText === '' ||
    repsText === ''
  ) {
    return null;
  }

  const weight = Number(weightText);
  const reps = Number(repsText);

  if (
    Number.isNaN(weight) ||
    Number.isNaN(reps)
  ) {
    return null;
  }

  return {
    weight: weight,
    reps: reps
  };
}

/* =========================
   Notion保存
========================= */

async function handleSubmitWorkout() {
  const shouldSave = confirm(
    'この内容でNotionに保存しますか？'
  );

  if (!shouldSave) {
    return;
  }

  submitButton.disabled = true;

  setMessage(
    submitMessage,
    '保存中...',
    ''
  );

  try {
    const payload =
      collectWorkoutPayload();

    await postToGas(payload);

    isClearingAfterSave = true;

    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }

    clearDraft();
    resetWorkoutForm();

    isClearingAfterSave = false;

    setMessage(
      submitMessage,
      'Notionに保存しました。' +
      '入力データと下書きを削除しました。',
      'success'
    );

    await loadCalendar();

  } catch (error) {
    console.error(error);

    isClearingAfterSave = false;

    setMessage(
      submitMessage,
      '保存に失敗しました: ' +
      error.message,
      'error'
    );

    submitButton.disabled = false;
    saveDraftDebounced();
  }
}

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
   下書き保存
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
    saveDraftNow
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (
        document.visibilityState ===
        'hidden'
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

function collectDraftState() {
  const selectedPickerIds =
    Array.from(
      exercisePicker.querySelectorAll(
        '.picker-checkbox:checked'
      )
    ).map(
      (checkbox) => checkbox.value
    );

  const exerciseCards =
    Array.from(
      exerciseList.querySelectorAll(
        '.exercise-card'
      )
    ).map((card) => {
      const sets =
        Array.from(
          card.querySelectorAll(
            '.sets-container > .set-block'
          )
        ).map((block) => {
          const subsets =
            Array.from(
              block.querySelectorAll(
                '.subset-row'
              )
            ).map((subset) => {
              return {
                weight:
                  subset.querySelector(
                    '.subset-weight'
                  ).value,

                reps:
                  subset.querySelector(
                    '.subset-reps'
                  ).value
              };
            });

          return {
            weight:
              block.querySelector(
                '.set-weight'
              ).value,

            reps:
              block.querySelector(
                '.set-reps'
              ).value,

            success:
              block.querySelector(
                '.set-row'
              ).dataset.success !== 'false',

            subsets: subsets
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

        sets: sets
      };
    });

  return {
    savedAt:
      new Date().toISOString(),

    date:
      workoutDateInput.value,

    bodyPart:
      bodyPartSelect.value,

    sessionMemo:
      sessionMemoInput.value,

    loadedExercises:
      loadedExercises,

    selectedPickerIds:
      selectedPickerIds,

    exerciseCards:
      exerciseCards
  };
}

function hasMeaningfulDraftData(draft) {
  return Boolean(
    draft.bodyPart ||
    draft.sessionMemo?.trim() ||
    draft.selectedPickerIds?.length ||
    draft.exerciseCards?.length
  );
}

function saveDraftNow() {
  if (
    isRestoringDraft ||
    isClearingAfterSave
  ) {
    return;
  }

  const draft =
    collectDraftState();

  try {
    if (
      hasMeaningfulDraftData(draft)
    ) {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(draft)
      );

    } else {
      clearDraft();
    }

  } catch (error) {
    console.error(
      '下書き保存に失敗しました',
      error
    );
  }
}

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

function loadDraft() {
  try {
    const text =
      localStorage.getItem(
        DRAFT_STORAGE_KEY
      );

    return text
      ? JSON.parse(text)
      : null;

  } catch (error) {
    clearDraft();
    return null;
  }
}

async function restoreDraftOnOpen() {
  const draft = loadDraft();

  if (
    !draft ||
    !hasMeaningfulDraftData(draft)
  ) {
    return;
  }

  const savedDate =
    draft.savedAt
      ? new Date(
          draft.savedAt
        ).toLocaleString('ja-JP')
      : '';

  const shouldRestore = confirm(
    '保存前の下書きがあります。' +
    '復元しますか？' +
    (
      savedDate
        ? `\n\n保存日時: ${savedDate}`
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

async function restoreDraft(draft) {
  isRestoringDraft = true;

  try {
    workoutDateInput.value =
      draft.date ||
      getTodayIsoDate();

    bodyPartSelect.value =
      draft.bodyPart || '';

    sessionMemoInput.value =
      draft.sessionMemo || '';

    loadedExercises =
      Array.isArray(
        draft.loadedExercises
      )
        ? draft.loadedExercises
        : [];

    if (
      loadedExercises.length === 0 &&
      draft.bodyPart
    ) {
      const data = await getFromGas({
        action:
          'getExercisesWithLastWorkout',

        bodyPart:
          draft.bodyPart
      });

      loadedExercises =
        data.exercises || [];
    }

    if (
      loadedExercises.length > 0
    ) {
      renderExercisePicker(
        loadedExercises
      );

      addSelectedExercisesButton.disabled =
        false;

      const selectedIds =
        Array.isArray(
          draft.selectedPickerIds
        )
          ? draft.selectedPickerIds
          : [];

      selectedIds.forEach((id) => {
        const checkbox =
          exercisePicker.querySelector(
            `.picker-checkbox[value="${id}"]`
          );

        if (checkbox) {
          checkbox.checked = true;
        }
      });
    }

    const savedCards =
      Array.isArray(
        draft.exerciseCards
      )
        ? draft.exerciseCards
        : [];

    savedCards.forEach(
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
            lastWorkout: null
          };
        }

        renderExerciseCard(
          exercise,
          savedExerciseData
        );
      }
    );

    submitButton.disabled =
      !exerciseList.querySelector(
        '.exercise-card'
      );

    setStatus(
      `${draft.bodyPart || ''}` +
      'の下書きを復元しました。'
    );

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
   予定
========================= */

function togglePlanForm() {
  const opening =
    planForm.classList.contains(
      'hidden'
    );

  planForm.classList.toggle(
    'hidden',
    !opening
  );

  togglePlanFormButton.textContent =
    opening
      ? '予定を閉じる'
      : '予定を追加';

  if (
    opening &&
    !planDateInput.value
  ) {
    planDateInput.value =
      getTodayIsoDate();
  }
}

function openPlanFormForDate(date) {
  planDateInput.value = date;

  planForm.classList.remove(
    'hidden'
  );

  togglePlanFormButton.textContent =
    '予定を閉じる';

  setMessage(
    planMessage,
    '予定日を選択しました。' +
    '部位を選んで保存してください。',
    ''
  );

  planForm.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}

async function handleSavePlan() {
  const date =
    planDateInput.value;

  const bodyPart =
    planBodyPartSelect.value;

  if (!date) {
    alert(
      '予定日を入力してください。'
    );
    return;
  }

  if (!bodyPart) {
    alert(
      '部位を選択してください。'
    );
    return;
  }

  savePlanButton.disabled = true;

  setMessage(
    planMessage,
    '予定を保存中...',
    ''
  );

  try {
    await postToGas({
      action: 'createPlan',
      date: date,
      bodyPart: bodyPart,
      memo:
        planMemoInput.value.trim()
    });

    setMessage(
      planMessage,
      '予定を保存しました。',
      'success'
    );

    planMemoInput.value = '';
    planBodyPartSelect.value = '';

    currentCalendarDate =
      new Date(
        Number(date.slice(0, 4)),
        Number(date.slice(5, 7)) - 1,
        1
      );

    await loadCalendar();

  } catch (error) {
    console.error(error);

    setMessage(
      planMessage,
      '予定の保存に失敗しました: ' +
      error.message,
      'error'
    );

  } finally {
    savePlanButton.disabled = false;
  }
}

/* =========================
   カレンダー
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

function renderCalendar(
  year,
  month,
  sessions
) {
  calendarGrid.innerHTML = '';

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

  const firstDate =
    new Date(year, month - 1, 1);

  const firstDayOffset =
    (firstDate.getDay() + 6) % 7;

  const daysInMonth =
    new Date(year, month, 0)
      .getDate();

  for (
    let index = 0;
    index < firstDayOffset;
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
    const date =
      `${String(year).padStart(4, '0')}-` +
      `${String(month).padStart(2, '0')}-` +
      `${String(day).padStart(2, '0')}`;

    const cell =
      document.createElement('button');

    cell.type = 'button';
    cell.className = 'calendar-day';

    if (
      date === getTodayIsoDate()
    ) {
      cell.classList.add('today');
    }

    cell.addEventListener(
      'click',
      () => {
        openPlanFormForDate(date);
      }
    );

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

    const bodyPartMap = {};

    const daySessions =
      grouped[date] || [];

    daySessions.forEach((session) => {
      const type =
        getSessionType(session);

      if (
        !bodyPartMap[
          session.bodyPart
        ] ||
        type === 'actual'
      ) {
        bodyPartMap[
          session.bodyPart
        ] = type;
      }
    });

    Object.entries(
      bodyPartMap
    ).forEach(
      ([bodyPart, type]) => {
        const badge =
          document.createElement('span');

        badge.className =
          `body-badge ${type}`;

        const shortNames = {
          '背中': '背',
          '全身': '全'
        };

        badge.textContent =
          shortNames[bodyPart] ||
          bodyPart.slice(0, 1);

        badges.appendChild(badge);
      }
    );

    cell.appendChild(dayNumber);
    cell.appendChild(badges);

    calendarGrid.appendChild(cell);
  }
}

function getSessionType(session) {
  if (
    session.type === 'actual' ||
    session.status === 'Done'
  ) {
    return 'actual';
  }

  return 'plan';
}

/* =========================
   実行
========================= */

init();
