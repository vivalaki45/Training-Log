const GAS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbwBo79Nq-fAgvkIAnncSnJW2u-f4o3rG_JhpESt0DqCdnwSijb6bQ71Se53PrwJS_vK/exec';
​
const DRAFT_STORAGE_KEY = 'workoutLoggerDraftV2';
​
const $ = (id) => document.getElementById(id);
​
/* =========================
   DOM
========================= */
​
const workoutDateInput = $('workoutDate');
const bodyPartSelect = $('bodyPart');
const extraBodyParts = $('extraBodyParts');
const sessionMemoInput = $('sessionMemo');
​
const loadExercisesButton = $('loadExercisesButton');
const createExerciseButton = $('createExerciseButton');
const archiveExercisesButton = $('archiveExercisesButton');
const addSelectedExercisesButton = $('addSelectedExercisesButton');
​
const exercisePicker = $('exercisePicker');
const exerciseList = $('exerciseList');
const statusMessage = $('statusMessage');
​
const submitButton = $('submitButton');
const submitMessage = $('submitMessage');
​
const pickerItemTemplate = $('pickerItemTemplate');
const exerciseTemplate = $('exerciseTemplate');
const setTemplate = $('setTemplate');
const subsetTemplate = $('subsetTemplate');
​
const tabButtons = document.querySelectorAll('.tab-button');
const logTab = $('logTab');
const calendarTab = $('calendarTab');
​
const prevMonthButton = $('prevMonthButton');
const nextMonthButton = $('nextMonthButton');
const todayMonthButton = $('todayMonthButton');
​
const calendarTitle = $('calendarTitle');
const calendarStatus = $('calendarStatus');
const calendarGrid = $('calendarGrid');
​
const togglePlanFormButton = $('togglePlanFormButton');
const planForm = $('planForm');
const planDateInput = $('planDate');
const planBodyPartSelect = $('planBodyPart');
const planMemoInput = $('planMemo');
const savePlanButton = $('savePlanButton');
const planMessage = $('planMessage');
​
/* =========================
   状態
========================= */
​
let loadedExercises = [];
let selectedExerciseIds = [];
let loadedBodyPart = '';
let loadedBodyParts = [];
​
let currentCalendarDate = new Date();
let calendarRequestNumber = 0;
​
let isRestoringDraft = false;
let isClearingAfterSave = false;
let draftSaveTimer = null;
​
/* =========================
   初期化
========================= */
​
function init() {
  const today = getTodayIsoDate();
​
  workoutDateInput.value = today;
  planDateInput.value = today;
​
  archiveExercisesButton.disabled = true;
​
  loadExercisesButton.addEventListener(
    'click',
    handleLoadExercises
  );
​
  createExerciseButton.addEventListener(
    'click',
    handleCreateExercise
  );
​
  archiveExercisesButton.addEventListener(
    'click',
    handleArchiveExercises
  );
​
  addSelectedExercisesButton.addEventListener(
    'click',
    handleAddSelectedExercises
  );
​
  submitButton.addEventListener(
    'click',
    handleSubmitWorkout
  );
​
  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tab);
    });
  });
​
  prevMonthButton.addEventListener('click', () => {
    currentCalendarDate = new Date(
      currentCalendarDate.getFullYear(),
      currentCalendarDate.getMonth() - 1,
      1
    );
​
    loadCalendar();
  });
​
  nextMonthButton.addEventListener('click', () => {
    currentCalendarDate = new Date(
      currentCalendarDate.getFullYear(),
      currentCalendarDate.getMonth() + 1,
      1
    );
​
    loadCalendar();
  });
​
  todayMonthButton.addEventListener('click', () => {
    currentCalendarDate = new Date();
    loadCalendar();
  });
​
  togglePlanFormButton.addEventListener(
    'click',
    togglePlanForm
  );
​
  savePlanButton.addEventListener(
    'click',
    handleSavePlan
  );
​
  setupExtraBodyParts();
  setupDraftAutoSave();
  restoreDraftOnOpen();
}
​
/* =========================
   タブ
========================= */
​
function switchTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle(
      'active',
      button.dataset.tab === tabName
    );
  });
​
  logTab.classList.toggle('active', tabName === 'log');
​
  calendarTab.classList.toggle(
    'active',
    tabName === 'calendar'
  );
​
  if (tabName === 'calendar') {
    loadCalendar();
  }
}
​
/* =========================
   共通
========================= */
​
function getTodayIsoDate() {
  const now = new Date();
​
  const localDate = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
​
  return localDate.toISOString().slice(0, 10);
}
​
function setStatus(text) {
  statusMessage.textContent = text || '';
}
​
function setMessage(element, text, type) {
  element.textContent = text || '';
​
  element.className =
    element === submitMessage
      ? 'submit-message'
      : 'plan-message';
​
  if (type) {
    element.classList.add(type);
  }
}
​
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
​
/* =========================
   GAS通信
========================= */
​
async function getFromGas(params) {
  const url = new URL(GAS_WEB_APP_URL);
​
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
​
  const response = await fetch(url);
​
  if (!response.ok) {
    throw new Error(
      `通信エラー HTTP ${response.status}`
    );
  }
​
  const data = await response.json();
​
  if (!data.ok) {
    throw new Error(data.error || 'GAS API error');
  }
​
  return data;
}
​
async function postToGas(payload) {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });
​
  if (!response.ok) {
    throw new Error(
      `通信エラー HTTP ${response.status}`
    );
  }
​
  const data = await response.json();
​
  if (!data.ok) {
    throw new Error(data.error || 'GAS API error');
  }
​
  return data;
}
​
/* =========================
   複数部位
========================= */
function setupExtraBodyParts() {
  Array.from(bodyPartSelect.options).filter(option => option.value).forEach(option => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = option.value;
    input.addEventListener('change', saveDraftDebounced);
    const text = document.createElement('span');
    text.textContent = option.value;
    label.append(input, text);
    extraBodyParts.appendChild(label);
  });
  bodyPartSelect.addEventListener('change', syncExtraBodyParts);
  syncExtraBodyParts();
}
​
function syncExtraBodyParts() {
  extraBodyParts.querySelectorAll('input').forEach(input => {
    input.disabled = input.value === bodyPartSelect.value;
    if (input.disabled) input.checked = false;
  });
}
​
function getSelectedBodyParts() {
  const primary = bodyPartSelect.value;
  if (!primary) return [];
  return [primary, ...Array.from(extraBodyParts.querySelectorAll('input:checked'))
    .map(input => input.value).filter(value => value !== primary)];
}
​
function bodyPartsMatchLoaded() {
  const selected = getSelectedBodyParts();
  return selected.length === loadedBodyParts.length &&
    selected.every((part, index) => part === loadedBodyParts[index]);
}
​
async function fetchExercisesForParts(parts) {
  const results = await Promise.all(parts.map(bodyPart => getFromGas({
    action: 'getExercisesWithLastWorkout', bodyPart
  })));
  return results.flatMap(data => data.exercises || []);
}
​
/* =========================
   種目読み込み
========================= */
​
async function handleLoadExercises() {
  const bodyPart = bodyPartSelect.value;
​
  if (!bodyPart) {
    alert('部位を選択してください。');
    return;
  }
​
  if (
    exerciseList.querySelector('.exercise-card') &&
    !confirm(
      '種目を読み直すと、現在の種目入力欄を入れ替えます。続けますか？'
    )
  ) {
    return;
  }
​
  loadExercisesButton.disabled = true;
​
  setStatus('種目を読み込み中...');
  setMessage(submitMessage, '', '');
​
  try {
    const parts = getSelectedBodyParts();
    const exercises = await fetchExercisesForParts(parts);
    loadedExercises = exercises;
    selectedExerciseIds = [];
    loadedBodyPart = bodyPart;
    loadedBodyParts = parts;
​
    exerciseList.innerHTML = '';
    submitButton.disabled = true;
​
    renderExercisePicker(loadedExercises);
​
    setStatus(
      loadedExercises.length
        ? `${loadedBodyParts.join(' + ')}の種目を読み込みました。今日やる種目を選んでください。`
        : 'この部位に登録されている種目がありません。「＋ 新しい種目」から追加できます。'
    );
​
    saveDraftDebounced();
​
  } catch (error) {
    console.error(error);
​
    setStatus(
      '読み込みに失敗しました: ' + error.message
    );
​
  } finally {
    loadExercisesButton.disabled = false;
  }
}
​
/*
 * 種目マスター操作後は一覧だけ更新する。
 * 入力中のトレーニングカードは消さない。
 */
async function refreshExerciseMaster(bodyPart) {
  const parts = loadedBodyParts.length ? loadedBodyParts : getSelectedBodyParts();
  const exercises = await fetchExercisesForParts(parts);
​
  selectedExerciseIds = selectedExerciseIds.filter(
    (id) => exercises.some((exercise) => exercise.id === id)
  );
​
  loadedExercises = exercises;
  loadedBodyPart = bodyPart;
​
  renderExercisePicker(loadedExercises);
  saveDraftDebounced();
}
​
/* =========================
   種目選択
========================= */
​
function renderExercisePicker(exercises) {
  exercisePicker.innerHTML = '';
​
  exercises.forEach((exercise) => {
    const node =
      pickerItemTemplate.content.cloneNode(true);
​
    const item = node.querySelector('.picker-item');
    const checkbox =
      node.querySelector('.picker-checkbox');
​
    item.dataset.exerciseId = exercise.id;
    checkbox.value = exercise.id;
​
    checkbox.checked =
      selectedExerciseIds.includes(exercise.id);
​
    node.querySelector('.picker-name').textContent =
      exercise.name;
​
    node.querySelector('.picker-category').textContent = [
      exercise.bodyPart,
      exercise.category
    ].filter(Boolean).join(' / ');
​
    checkbox.addEventListener('change', () => {
      handlePickerChange(
        exercise.id,
        checkbox.checked
      );
    });
​
    exercisePicker.appendChild(node);
  });
​
  refreshPickerOrder();
  updatePickerButtons();
}
​
function handlePickerChange(exerciseId, checked) {
  if (checked) {
    if (!selectedExerciseIds.includes(exerciseId)) {
      selectedExerciseIds.push(exerciseId);
    }
  } else {
    selectedExerciseIds = selectedExerciseIds.filter(
      (id) => id !== exerciseId
    );
  }
​
  refreshPickerOrder();
  updatePickerButtons();
  saveDraftDebounced();
}
​
function refreshPickerOrder() {
  exercisePicker.querySelectorAll(
    '.picker-item'
  ).forEach((item) => {
    const order = selectedExerciseIds.indexOf(
      item.dataset.exerciseId
    );
​
    const orderElement =
      item.querySelector('.picker-order');
​
    if (orderElement) {
      orderElement.textContent =
        order >= 0 ? String(order + 1) : '';
    }
​
    item.classList.toggle('selected', order >= 0);
  });
}
​
function updatePickerButtons() {
  const hasSelection = selectedExerciseIds.length > 0;
​
  addSelectedExercisesButton.disabled = !hasSelection;
  archiveExercisesButton.disabled = !hasSelection;
}
​
function handleAddSelectedExercises() {
  if (loadedBodyParts.length && !bodyPartsMatchLoaded()) {
    alert('部位が変更されています。種目を読み直してください。');
    return;
  }
​
  if (selectedExerciseIds.length === 0) {
    alert('今日やる種目を選んでください。');
    return;
  }
​
  selectedExerciseIds.forEach((exerciseId) => {
    const exercise = loadedExercises.find(
      (item) => item.id === exerciseId
    );
​
    if (
      exercise &&
      !isExerciseAlreadyAdded(exercise.id)
    ) {
      renderExerciseCard(exercise);
    }
  });
​
  submitButton.disabled =
    !exerciseList.querySelector('.exercise-card');
​
  setStatus('選んだ種目を、選択した順番で追加しました。');
  saveDraftDebounced();
}
​
function isExerciseAlreadyAdded(exerciseId) {
  return Array.from(
    exerciseList.querySelectorAll('.exercise-card')
  ).some((card) => {
    return card.dataset.exerciseId === exerciseId;
  });
}
​
/* =========================
   種目マスター追加
========================= */
​
async function handleCreateExercise() {
  let bodyPart = bodyPartSelect.value;
​
  if (!bodyPart) {
    alert('先に部位を選択してください。');
    return;
  }
​
  if (
    loadedBodyPart &&
    loadedBodyPart !== bodyPart &&
    exerciseList.querySelector('.exercise-card')
  ) {
    alert(
      '入力中の種目と部位が異なります。先に記録を保存するか、元の部位に戻してください。'
    );
    return;
  }
​
  if (loadedBodyParts.length && !bodyPartsMatchLoaded()) {
    alert('部位が変更されています。種目を読み直してください。');
    return;
  }
​
  const parts = getSelectedBodyParts();
  if (parts.length > 1) {
    const choice = prompt(
      '新しい種目の部位を番号で選んでください。\n' +
      parts.map((part, i) => `${i + 1}: ${part}`).join('\n'), '1'
    );
    if (choice === null) return;
    const index = Number(choice.trim()) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= parts.length) {
      alert('表示された番号を入力してください。');
      return;
    }
    bodyPart = parts[index];
  }
​
  const enteredName =
    prompt('新しい種目名を入力してください。');
​
  const name = String(enteredName || '').trim();
​
  if (!name) {
    return;
  }
​
  const duplicate = loadedExercises.some((exercise) => {
    return (
      exercise.bodyPart === bodyPart &&
      exercise.name.trim() === name
    );
  });
​
  if (duplicate) {
    alert('同じ名前の種目がすでにあります。');
    return;
  }
​
  const enteredCategory = prompt(
    'カテゴリーを入力してください。\n例：Barbell、Dumbbell、Machine、Cable',
    ''
  );
​
  if (enteredCategory === null) {
    return;
  }
​
  const category = enteredCategory.trim();
​
  createExerciseButton.disabled = true;
  archiveExercisesButton.disabled = true;
  loadExercisesButton.disabled = true;
​
  setStatus('新しい種目を追加中...');
​
  let created = false;
​
  try {
    await postToGas({
      action: 'createExercise',
      name: name,
      bodyPart: bodyPart,
      category: category
    });
​
    created = true;
​
    if (!loadedBodyParts.length) {
      loadedBodyParts = getSelectedBodyParts();
      loadedBodyPart = bodyPartSelect.value;
    }
    await refreshExerciseMaster(loadedBodyPart);
​
    setStatus(
      `${name}を追加しました。一覧から選択できます。`
    );
​
  } catch (error) {
    console.error(error);
​
    setStatus(
      created
        ? '種目は追加できましたが、一覧の更新に失敗しました: ' +
          error.message
        : '種目の追加に失敗しました: ' + error.message
    );
​
  } finally {
    createExerciseButton.disabled = false;
    loadExercisesButton.disabled = false;
    updatePickerButtons();
  }
}
​
/* =========================
   種目マスター非表示
========================= */
​
async function handleArchiveExercises() {
  if (loadedBodyParts.length && !bodyPartsMatchLoaded()) {
    alert('部位が変更されています。種目を読み直してください。');
    return;
  }
  if (selectedExerciseIds.length === 0) {
    alert('削除する種目を選択してください。');
    return;
  }
​
  const targetIds = [...selectedExerciseIds];
​
  const selectedNames = targetIds.map((exerciseId) => {
    return loadedExercises.find(
      (exercise) => exercise.id === exerciseId
    )?.name;
  }).filter(Boolean);
​
  if (!confirm(
    '次の種目を一覧から非表示にしますか？\n\n' +
    selectedNames.join('\n') +
    '\n\n過去の記録と、現在入力中のカードは残ります。'
  )) {
    return;
  }
​
  const bodyPart = loadedBodyPart || bodyPartSelect.value;
​
  createExerciseButton.disabled = true;
  archiveExercisesButton.disabled = true;
  addSelectedExercisesButton.disabled = true;
  loadExercisesButton.disabled = true;
​
  setStatus('選択した種目を非表示にしています...');
​
  try {
    for (const exerciseId of targetIds) {
      await postToGas({
        action: 'archiveExercise',
        exerciseId: exerciseId
      });
    }
​
    selectedExerciseIds = [];
    await refreshExerciseMaster(bodyPart);
​
    setStatus(
      '選択した種目を非表示にしました。過去の記録は残っています。'
    );
​
  } catch (error) {
    console.error(error);
​
    setStatus(
      '種目の非表示処理に失敗しました: ' + error.message
    );
​
  } finally {
    createExerciseButton.disabled = false;
    loadExercisesButton.disabled = false;
    updatePickerButtons();
  }
}
​
/* =========================
   種目カード
========================= */
​
function renderExerciseCard(exercise, savedExerciseData) {
  const node =
    exerciseTemplate.content.cloneNode(true);
​
  const card = node.querySelector('.exercise-card');
  const setsContainer =
    node.querySelector('.sets-container');
​
  card.dataset.exerciseId = exercise.id;
  card.dataset.exerciseName = exercise.name;
  card.dataset.bodyPart = exercise.bodyPart || '';
​
  node.querySelector('.exercise-name').textContent =
    exercise.name;
​
  node.querySelector('.exercise-category').textContent = [
    exercise.bodyPart,
    exercise.category
  ].filter(Boolean).join(' / ');
​
  node.querySelector('.last-workout-content').innerHTML =
    renderLastWorkoutHtml(exercise.lastWorkout);
​
  const memoInput =
    node.querySelector('.exercise-memo');
​
  memoInput.value = savedExerciseData?.memo || '';
​
  memoInput.addEventListener(
    'input',
    saveDraftDebounced
  );
​
  const initialSets = savedExerciseData?.sets?.length
    ? savedExerciseData.sets
    : groupPreviousSets(exercise.lastWorkout);
​
  if (initialSets.length > 0) {
    initialSets.forEach((set) => {
      addSetBlock(setsContainer, set);
    });
  } else {
    for (let index = 0; index < 3; index += 1) {
      addSetBlock(setsContainer, {
        weight: '',
        reps: '',
        success: true,
        subsets: []
      });
    }
  }
​
  node.querySelector('.add-set-button')
    .addEventListener('click', () => {
      addSetBlock(setsContainer, {
        weight: '',
        reps: '',
        success: true,
        subsets: []
      });
​
      saveDraftDebounced();
    });
​
  node.querySelector('.move-up-button')
    .addEventListener('click', () => {
      const previous = card.previousElementSibling;
​
      if (previous) {
        exerciseList.insertBefore(card, previous);
      }
​
      saveDraftDebounced();
    });
​
  node.querySelector('.move-down-button')
    .addEventListener('click', () => {
      const next = card.nextElementSibling;
​
      if (next) {
        exerciseList.insertBefore(next, card);
      }
​
      saveDraftDebounced();
    });
​
  node.querySelector('.remove-exercise-button')
    .addEventListener('click', () => {
      card.remove();
​
      submitButton.disabled =
        !exerciseList.querySelector('.exercise-card');
​
      saveDraftDebounced();
    });
​
  exerciseList.appendChild(node);
}
​
/* =========================
   直近記録・前回メモ
========================= */
​
function renderLastWorkoutHtml(lastWorkout) {
  if (
    !lastWorkout ||
    !Array.isArray(lastWorkout.sets) ||
    lastWorkout.sets.length === 0
  ) {
    return '<div class="last-workout-empty">直近記録なし</div>';
  }
​
  const previousMemo =
    getPreviousExerciseMemo(lastWorkout);
​
  const lines = lastWorkout.sets.map((set) => {
    const label = isDownSet(set)
      ? formatSetNo(set.setNo) + ' ダウン'
      : set.setNo + 'set';
​
    const mark = set.success === false ? 'FAIL' : 'GOOD';
​
    const failClass =
      set.success === false ? ' last-set-fail' : '';
​
    return (
      '<div class="last-set-line' + failClass + '">' +
        '<span class="last-set-label">' +
          escapeHtml(label) + ':' +
        '</span>' +
        '<span>' +
          escapeHtml(set.weight ?? '') + 'kg × ' +
          escapeHtml(set.reps ?? '') + '回 ' +
          mark +
        '</span>' +
      '</div>'
    );
  }).join('');
​
  /*
   * HTML整形用の改行や空白を入れない。
   * メモ本文の改行だけを表示する。
   */
  const memoHtml = previousMemo
    ? (
        '<div class="previous-exercise-memo">' +
          '<div class="previous-memo-label">' +
            '前回の種目メモ' +
          '</div>' +
          '<div class="previous-memo-text">' +
            escapeHtml(previousMemo) +
          '</div>' +
        '</div>'
      )
    : (
        '<div class="previous-exercise-memo empty">' +
          '前回の種目メモなし' +
        '</div>'
      );
​
  return (
    '<div class="last-workout-date">' +
      '日付：' +
      escapeHtml(lastWorkout.lastDate || '') +
    '</div>' +
    '<div class="last-workout-sets">' +
      lines +
    '</div>' +
    memoHtml
  );
}
​
function getPreviousExerciseMemo(lastWorkout) {
  if (
    !lastWorkout ||
    !Array.isArray(lastWorkout.sets)
  ) {
    return '';
  }
​
  const memoSet = lastWorkout.sets.find((set) => {
    return Boolean(cleanExerciseMemo(set.memo));
  });
​
  return memoSet ? cleanExerciseMemo(memoSet.memo) : '';
}
​
function cleanExerciseMemo(memo) {
  return String(memo || '')
    .replaceAll('【ダウンセット】', '')
    .trim();
}
​
function isDownSet(set) {
  return (
    !Number.isInteger(Number(set.setNo)) ||
    String(set.memo || '').includes('【ダウンセット】')
  );
}
​
function formatSetNo(setNo) {
  const number = Number(setNo);
  const parent = Math.floor(number);
  const child = Math.round((number - parent) * 10);
​
  return `${parent}-${child || 1}`;
}
​
function groupPreviousSets(lastWorkout) {
  if (
    !lastWorkout ||
    !Array.isArray(lastWorkout.sets)
  ) {
    return [];
  }
​
  const normalSets = [];
  const setMap = {};
​
  lastWorkout.sets.forEach((set) => {
    const setNumber = Number(set.setNo) || 1;
    const parentNumber = Math.floor(setNumber);
​
    const childNumber = Math.round(
      (setNumber - parentNumber) * 10
    );
​
    if (childNumber > 0 || isDownSet(set)) {
      if (!setMap[parentNumber]) {
        const emptyParent = {
          weight: '',
          reps: '',
          success: true,
          subsets: []
        };
​
        normalSets.push(emptyParent);
        setMap[parentNumber] = emptyParent;
      }
​
      setMap[parentNumber].subsets.push({
        weight: set.weight ?? '',
        reps: set.reps ?? ''
      });
​
    } else {
      const parentSet = {
        weight: set.weight ?? '',
        reps: set.reps ?? '',
        success: set.success !== false,
        subsets: []
      };
​
      normalSets.push(parentSet);
      setMap[parentNumber] = parentSet;
    }
  });
​
  return normalSets;
}
​
/* =========================
   通常セット
========================= */
​
function addSetBlock(container, initialValue = {}) {
  const node = setTemplate.content.cloneNode(true);
​
  const block = node.querySelector('.set-block');
  const row = node.querySelector('.set-row');
​
  const weightInput = node.querySelector('.set-weight');
  const repsInput = node.querySelector('.set-reps');
​
  const subsetsContainer =
    node.querySelector('.subsets-container');
​
  weightInput.value = initialValue.weight ?? '';
  repsInput.value = initialValue.reps ?? '';
​
  row.dataset.success =
    initialValue.success === false ? 'false' : 'true';
​
  [weightInput, repsInput].forEach((input) => {
    enableSelectAllOnFocus(input);
​
    input.addEventListener(
      'input',
      saveDraftDebounced
    );
  });
​
  updateResultButtons(row);
​
  node.querySelectorAll('.result-button')
    .forEach((button) => {
      button.addEventListener('click', () => {
        row.dataset.success = button.dataset.success;
​
        updateResultButtons(row);
        saveDraftDebounced();
      });
    });
​
  node.querySelector('.remove-set-button')
    .addEventListener('click', () => {
      block.remove();
​
      refreshSetNumbers(container);
      saveDraftDebounced();
    });
​
  node.querySelector('.add-subset-button')
    .addEventListener('click', () => {
      addSubsetRow(subsetsContainer, {});
      saveDraftDebounced();
    });
​
  const savedSubsets = Array.isArray(initialValue.subsets)
    ? initialValue.subsets
    : [];
​
  savedSubsets.forEach((subset) => {
    addSubsetRow(subsetsContainer, subset);
  });
​
  container.appendChild(node);
  refreshSetNumbers(container);
}
​
/* =========================
   ダウンセット
========================= */
​
function addSubsetRow(container, initialValue = {}) {
  const node =
    subsetTemplate.content.cloneNode(true);
​
  const row = node.querySelector('.subset-row');
​
  const weightInput =
    node.querySelector('.subset-weight');
​
  const repsInput =
    node.querySelector('.subset-reps');
​
  weightInput.value = initialValue.weight ?? '';
  repsInput.value = initialValue.reps ?? '';
​
  [weightInput, repsInput].forEach((input) => {
    enableSelectAllOnFocus(input);
​
    input.addEventListener(
      'input',
      saveDraftDebounced
    );
  });
​
  node.querySelector('.remove-subset-button')
    .addEventListener('click', () => {
      row.remove();
​
      refreshSubsetNumbers(container);
      saveDraftDebounced();
    });
​
  container.appendChild(node);
  refreshSubsetNumbers(container);
}
​
function refreshSetNumbers(container) {
  container.querySelectorAll(
    ':scope > .set-block'
  ).forEach((block, index) => {
    block.querySelector('.set-number').textContent =
      String(index + 1);
  });
}
​
function refreshSubsetNumbers(container) {
  container.querySelectorAll(
    ':scope > .subset-row'
  ).forEach((row, index) => {
    row.querySelector('.subset-number').textContent =
      `${index + 1}段目`;
  });
}
​
function enableSelectAllOnFocus(input) {
  const selectAll = () => {
    setTimeout(() => {
      try {
        input.select();
      } catch (error) {
        console.debug(error);
      }
    }, 0);
  };
​
  input.addEventListener('focus', selectAll);
​
  input.addEventListener('mouseup', (event) => {
    event.preventDefault();
  });
​
  input.addEventListener('touchend', selectAll);
}
​
function updateResultButtons(row) {
  const success = row.dataset.success !== 'false';
​
  row.querySelector('.result-button.success')
    .classList.toggle('active', success);
​
  row.querySelector('.result-button.fail')
    .classList.toggle('active', !success);
}
​
/* =========================
   保存データ収集
========================= */
​
function collectWorkoutPayload() {
  const date = workoutDateInput.value;
  const bodyPart = bodyPartSelect.value;
​
  if (!date) {
    throw new Error('日付を入力してください。');
  }
​
  if (!bodyPart) {
    throw new Error('部位を選択してください。');
  }
​
  if (loadedBodyParts.length && !bodyPartsMatchLoaded()) {
    throw new Error(
      '入力中の種目と選択中の部位が異なります。部位を元に戻してください。'
    );
  }
​
  const sets = [];
​
  exerciseList.querySelectorAll(
    '.exercise-card'
  ).forEach((card) => {
    const exerciseMemo =
      card.querySelector('.exercise-memo').value.trim();
​
    card.querySelectorAll(
      '.sets-container > .set-block'
    ).forEach((block, index) => {
      const parentSetNo = index + 1;
​
      const normalSet = readInputPair(
        block.querySelector('.set-weight'),
        block.querySelector('.set-reps')
      );
​
      if (normalSet) {
        sets.push({
          exerciseId: card.dataset.exerciseId,
          exerciseName: card.dataset.exerciseName,
          bodyPart: card.dataset.bodyPart || '',
          setNo: parentSetNo,
          weight: normalSet.weight,
          reps: normalSet.reps,
          success:
            block.querySelector('.set-row')
              .dataset.success !== 'false',
          memo: exerciseMemo
        });
      }
​
      block.querySelectorAll(
        '.subset-row'
      ).forEach((subset, subsetIndex) => {
        const pair = readInputPair(
          subset.querySelector('.subset-weight'),
          subset.querySelector('.subset-reps')
        );
​
        if (!pair) {
          return;
        }
​
        sets.push({
          exerciseId: card.dataset.exerciseId,
          exerciseName: card.dataset.exerciseName,
          bodyPart: card.dataset.bodyPart || '',
          setNo: Number(
            `${parentSetNo}.${subsetIndex + 1}`
          ),
          weight: pair.weight,
          reps: pair.reps,
          success: true,
          memo: `【ダウンセット】${exerciseMemo}`
        });
      });
    });
  });
​
  if (sets.length === 0) {
    throw new Error('登録するセットがありません。');
  }
​
  return {
    date: date,
    bodyPart: bodyPart,
    sessionName:
      `${date.replaceAll('-', '/')} ${[bodyPart, ...loadedBodyParts.filter(part => part !== bodyPart && sets.some(set => set.bodyPart === part))].join('＋')}`,
    memo: sessionMemoInput.value.trim(),
    sets: sets
  };
}
​
function readInputPair(weightInput, repsInput) {
  const weightText = weightInput.value;
  const repsText = repsInput.value;
​
  if (weightText === '' && repsText === '') {
    return null;
  }
​
  if (weightText === '' || repsText === '') {
    throw new Error(
      '重量と回数の片方だけが入力されたセットがあります。両方入力するか、両方空欄にしてください。'
    );
  }
​
  const weight = Number(weightText);
  const reps = Number(repsText);
​
  if (
    !Number.isFinite(weight) ||
    !Number.isFinite(reps) ||
    weight < 0 ||
    reps < 0
  ) {
    throw new Error(
      '重量・回数には0以上の数値を入力してください。'
    );
  }
​
  return {
    weight: weight,
    reps: reps
  };
}
​
/* =========================
   Notion保存
========================= */
​
async function handleSubmitWorkout() {
  let payload;
​
  try {
    payload = collectWorkoutPayload();
  } catch (error) {
    setMessage(
      submitMessage,
      error.message,
      'error'
    );
    return;
  }
​
  if (!confirm('この内容でNotionに保存しますか？')) {
    return;
  }
​
  submitButton.disabled = true;
​
  setMessage(submitMessage, '保存中...', '');
​
  try {
    await postToGas(payload);
​
    isClearingAfterSave = true;
​
    clearDraft();
    resetWorkoutForm();
​
    isClearingAfterSave = false;
​
    setMessage(
      submitMessage,
      'Notionに保存しました。入力データと下書きを削除しました。',
      'success'
    );
​
    await loadCalendar();
​
  } catch (error) {
    console.error(error);
​
    isClearingAfterSave = false;
    submitButton.disabled = false;
​
    setMessage(
      submitMessage,
      '保存に失敗しました: ' + error.message,
      'error'
    );
​
    saveDraftDebounced();
  }
}
​
function resetWorkoutForm() {
  workoutDateInput.value = getTodayIsoDate();
  bodyPartSelect.value = '';
  sessionMemoInput.value = '';
​
  exercisePicker.innerHTML = '';
  exerciseList.innerHTML = '';
​
  loadedExercises = [];
  selectedExerciseIds = [];
  loadedBodyPart = '';
  loadedBodyParts = [];
  extraBodyParts.querySelectorAll('input').forEach(input => { input.checked = false; });
  syncExtraBodyParts();
​
  addSelectedExercisesButton.disabled = true;
  archiveExercisesButton.disabled = true;
  submitButton.disabled = true;
​
  setStatus(
    '部位を選択して種目を読み込んでください。'
  );
}
​
/* =========================
   下書き自動保存
========================= */
​
function setupDraftAutoSave() {
  workoutDateInput.addEventListener(
    'change',
    saveDraftDebounced
  );
​
  bodyPartSelect.addEventListener(
    'change',
    saveDraftDebounced
  );
​
  sessionMemoInput.addEventListener(
    'input',
    saveDraftDebounced
  );
​
  window.addEventListener(
    'beforeunload',
    saveDraftNow
  );
​
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      saveDraftNow();
    }
  });
}
​
function saveDraftDebounced() {
  if (isRestoringDraft || isClearingAfterSave) {
    return;
  }
​
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
  }
​
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    saveDraftNow();
  }, 300);
}
​
function collectDraftState() {
  const exerciseCards = Array.from(
    exerciseList.querySelectorAll('.exercise-card')
  ).map((card) => {
    const sets = Array.from(
      card.querySelectorAll(
        '.sets-container > .set-block'
      )
    ).map((block) => {
      const subsets = Array.from(
        block.querySelectorAll('.subset-row')
      ).map((subset) => {
        return {
          weight:
            subset.querySelector('.subset-weight').value,
          reps:
            subset.querySelector('.subset-reps').value
        };
      });
​
      return {
        weight:
          block.querySelector('.set-weight').value,
        reps:
          block.querySelector('.set-reps').value,
        success:
          block.querySelector('.set-row')
            .dataset.success !== 'false',
        subsets: subsets
      };
    });
​
    return {
      exerciseId: card.dataset.exerciseId,
      exerciseName: card.dataset.exerciseName,
      bodyPart: card.dataset.bodyPart || '',
      memo: card.querySelector('.exercise-memo').value,
      sets: sets
    };
  });
​
  return {
    savedAt: new Date().toISOString(),
    date: workoutDateInput.value,
    bodyPart: bodyPartSelect.value,
    loadedBodyPart: loadedBodyPart,
    loadedBodyParts: [...loadedBodyParts],
    extraBodyParts: Array.from(extraBodyParts.querySelectorAll('input:checked')).map(input => input.value),
    sessionMemo: sessionMemoInput.value,
    loadedExercises: loadedExercises,
    selectedPickerIds: [...selectedExerciseIds],
    exerciseCards: exerciseCards
  };
}
​
function hasMeaningfulDraftData(draft) {
  return Boolean(
    draft.bodyPart ||
    draft.sessionMemo?.trim() ||
    draft.selectedPickerIds?.length ||
    draft.exerciseCards?.length
  );
}
​
function saveDraftNow() {
  if (isRestoringDraft || isClearingAfterSave) {
    return;
  }
​
  try {
    const draft = collectDraftState();
​
    if (hasMeaningfulDraftData(draft)) {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(draft)
      );
    } else {
      clearDraft();
    }
​
  } catch (error) {
    console.error('下書き保存に失敗しました', error);
  }
}
​
function clearDraft() {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
​
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem('workoutLoggerDraftV1');
  } catch (error) {
    console.error('下書き削除に失敗しました', error);
  }
}
​
function loadDraft() {
  try {
    const text =
      localStorage.getItem(DRAFT_STORAGE_KEY) ||
      localStorage.getItem('workoutLoggerDraftV1');
​
    return text ? JSON.parse(text) : null;
​
  } catch (error) {
    console.error('下書きを読み取れませんでした', error);
    return null;
  }
}
​
async function restoreDraftOnOpen() {
  const draft = loadDraft();
​
  if (!draft || !hasMeaningfulDraftData(draft)) {
    return;
  }
​
  const savedDate = draft.savedAt
    ? new Date(draft.savedAt).toLocaleString('ja-JP')
    : '';
​
  const shouldRestore = confirm(
    '保存前の下書きがあります。復元しますか？' +
    (savedDate ? `\n\n保存日時: ${savedDate}` : '')
  );
​
  if (!shouldRestore) {
    if (confirm('この下書きを削除しますか？')) {
      clearDraft();
    }
    return;
  }
​
  await restoreDraft(draft);
}
​
async function restoreDraft(draft) {
  isRestoringDraft = true;
​
  try {
    workoutDateInput.value =
      draft.date || getTodayIsoDate();
​
    bodyPartSelect.value = draft.bodyPart || '';
    const savedExtraParts = Array.isArray(draft.extraBodyParts) ? draft.extraBodyParts : [];
    extraBodyParts.querySelectorAll('input').forEach(input => {
      input.checked = savedExtraParts.includes(input.value);
    });
    syncExtraBodyParts();
    sessionMemoInput.value = draft.sessionMemo || '';
​
    loadedBodyPart =
      draft.loadedBodyPart || draft.bodyPart || '';
    loadedBodyParts = Array.isArray(draft.loadedBodyParts) && draft.loadedBodyParts.length
      ? draft.loadedBodyParts : (loadedBodyPart ? [loadedBodyPart] : []);
​
    loadedExercises = Array.isArray(draft.loadedExercises)
      ? draft.loadedExercises
      : [];
​
    selectedExerciseIds =
      Array.isArray(draft.selectedPickerIds)
        ? [...draft.selectedPickerIds]
        : [];
​
    exerciseList.innerHTML = '';
​
    if (
      loadedExercises.length === 0 &&
      loadedBodyPart
    ) {
      try {
        loadedExercises = await fetchExercisesForParts(loadedBodyParts);
​
      } catch (error) {
        // 通信できなくても、保存済みの入力内容は復元する。
        console.error(error);
      }
    }
​
    renderExercisePicker(loadedExercises);
​
    const savedCards = Array.isArray(draft.exerciseCards)
      ? draft.exerciseCards
      : [];
​
    savedCards.forEach((savedExerciseData) => {
      const exercise = loadedExercises.find((item) => {
        return item.id === savedExerciseData.exerciseId;
      }) || {
        id: savedExerciseData.exerciseId,
        name: savedExerciseData.exerciseName || '種目',
        bodyPart: savedExerciseData.bodyPart || loadedBodyPart,
        category: '',
        lastWorkout: null
      };
​
      renderExerciseCard(exercise, savedExerciseData);
    });
​
    submitButton.disabled =
      !exerciseList.querySelector('.exercise-card');
​
    setStatus(
      `${loadedBodyParts.join(' + ')}の下書きを復元しました。`
    );
​
  } catch (error) {
    console.error(error);
​
    setStatus(
      '下書き復元に失敗しました: ' + error.message
    );
​
  } finally {
    isRestoringDraft = false;
  }
}
​
/* =========================
   予定フォーム
========================= */
​
function togglePlanForm() {
  const opening = planForm.classList.contains('hidden');
​
  planForm.classList.toggle('hidden', !opening);
​
  togglePlanFormButton.textContent =
    opening ? '予定を閉じる' : '予定を追加';
​
  if (opening && !planDateInput.value) {
    planDateInput.value = getTodayIsoDate();
  }
}
​
function openPlanFormForDate(date) {
  planDateInput.value = date;
  planForm.classList.remove('hidden');
​
  togglePlanFormButton.textContent = '予定を閉じる';
​
  setMessage(
    planMessage,
    '予定日を選択しました。部位を選んで保存してください。',
    ''
  );
​
  planForm.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });
}
​
async function handleSavePlan() {
  const date = planDateInput.value;
  const bodyPart = planBodyPartSelect.value;
​
  if (!date) {
    alert('予定日を入力してください。');
    return;
  }
​
  if (!bodyPart) {
    alert('部位を選択してください。');
    return;
  }
​
  savePlanButton.disabled = true;
  setMessage(planMessage, '予定を保存中...', '');
​
  try {
    await postToGas({
      action: 'createPlan',
      date: date,
      bodyPart: bodyPart,
      memo: planMemoInput.value.trim()
    });
​
    setMessage(
      planMessage,
      '予定を保存しました。',
      'success'
    );
​
    planMemoInput.value = '';
    planBodyPartSelect.value = '';
​
    currentCalendarDate = new Date(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      1
    );
​
    await loadCalendar();
​
  } catch (error) {
    console.error(error);
​
    setMessage(
      planMessage,
      '予定の保存に失敗しました: ' + error.message,
      'error'
    );
​
  } finally {
    savePlanButton.disabled = false;
  }
}
​
/* =========================
   カレンダー
========================= */
​
async function loadCalendar() {
  const requestNumber = ++calendarRequestNumber;
​
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth() + 1;
​
  calendarTitle.textContent = `${year}年${month}月`;
  calendarStatus.textContent = '読み込み中...';
  calendarGrid.innerHTML = '';
​
  try {
    const data = await getFromGas({
      action: 'getMonthlySessions',
      year: year,
      month: month
    });
​
    if (requestNumber !== calendarRequestNumber) {
      return;
    }
​
    const sessions = data.sessions || [];
​
    renderCalendar(year, month, sessions);
​
    if (sessions.length === 0) {
      calendarStatus.textContent =
        'この月の予定・記録はありません。';
      return;
    }
​
    const actualCount = sessions.filter((session) => {
      return getSessionType(session) === 'actual';
    }).length;
​
    const planCount = sessions.filter((session) => {
      return getSessionType(session) === 'plan';
    }).length;
​
    calendarStatus.textContent =
      `実績 ${actualCount}件 / 予定 ${planCount}件`;
​
  } catch (error) {
    console.error(error);
​
    if (requestNumber === calendarRequestNumber) {
      calendarStatus.textContent =
        '読み込みに失敗しました: ' + error.message;
    }
  }
}
​
function renderCalendar(year, month, sessions) {
  calendarGrid.innerHTML = '';
​
  const grouped = {};
​
  sessions.forEach((session) => {
    if (!session.date) {
      return;
    }
​
    const dateKey = String(session.date).slice(0, 10);
​
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
​
    grouped[dateKey].push(session);
  });
​
  const firstDate = new Date(year, month - 1, 1);
  const firstDayOffset = (firstDate.getDay() + 6) % 7;
​
  const daysInMonth = new Date(
    year,
    month,
    0
  ).getDate();
​
  for (let index = 0; index < firstDayOffset; index += 1) {
    const emptyCell = document.createElement('div');
​
    emptyCell.className = 'calendar-day empty';
    calendarGrid.appendChild(emptyCell);
  }
​
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date =
      `${String(year).padStart(4, '0')}-` +
      `${String(month).padStart(2, '0')}-` +
      `${String(day).padStart(2, '0')}`;
​
    const cell = document.createElement('button');
​
    cell.type = 'button';
    cell.className = 'calendar-day';
​
    if (date === getTodayIsoDate()) {
      cell.classList.add('today');
    }
​
    cell.addEventListener('click', () => {
      openPlanFormForDate(date);
    });
​
    const dayNumber = document.createElement('div');
​
    dayNumber.className = 'calendar-day-number';
    dayNumber.textContent = String(day);
​
    const badges = document.createElement('div');
    badges.className = 'calendar-badges';
​
    const bodyPartMap = {};
​
    (grouped[date] || []).forEach((session) => {
      const bodyPart = session.bodyPart || '';
​
      if (!bodyPart) {
        return;
      }
​
      const type = getSessionType(session);
​
      if (
        !bodyPartMap[bodyPart] ||
        type === 'actual'
      ) {
        bodyPartMap[bodyPart] = type;
      }
    });
​
    Object.entries(bodyPartMap).forEach(
      ([bodyPart, type]) => {
        const badge = document.createElement('span');
​
        badge.className = `body-badge ${type}`;
​
        const shortNames = {
          '背中': '背',
          '全身': '全'
        };
​
        badge.textContent =
          shortNames[bodyPart] || bodyPart.slice(0, 1);
​
        badges.appendChild(badge);
      }
    );
​
    cell.appendChild(dayNumber);
    cell.appendChild(badges);
    calendarGrid.appendChild(cell);
  }
}
​
function getSessionType(session) {
  return (
    session.type === 'actual' ||
    session.status === 'Done'
  ) ? 'actual' : 'plan';
}
​
/* =========================
   実行
========================= */
​
init();
​
