/* 인사고과 관리 — 화면 동작 (외부 라이브러리 없음)
   점수 미리보기 공식은 evaluation/scoring.py 와 같다. 최종 값은 항상 서버가 계산한다. */
(function () {
  'use strict';

  // ------------------------------------------------------------ 제출 확인 · 두 번 누름 방지
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var submitter = event.submitter;
    var message = (submitter && submitter.dataset.confirm) || form.dataset.confirm;
    if (message && !window.confirm(message)) {
      event.preventDefault();
      return;
    }
    if (form.method.toLowerCase() === 'post') {
      // 누른 버튼의 name이 함께 전송된 뒤에 막는다.
      setTimeout(function () {
        form.querySelectorAll('button[type=submit], button:not([type])').forEach(function (button) {
          button.disabled = true;
        });
      }, 0);
    }
  });
  window.addEventListener('pageshow', function () {
    document.querySelectorAll('button[disabled]').forEach(function (button) {
      if (!button.hasAttribute('data-keep-disabled')) button.disabled = false;
    });
  });

  // ------------------------------------------------------------ 펼치기 · 자동 제출
  document.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-toggle]');
    if (!toggle) return;
    event.preventDefault();
    var target = document.querySelector(toggle.dataset.toggle);
    if (!target) return;
    target.classList.toggle('hidden');
    if (!target.classList.contains('hidden')) {
      var input = target.querySelector('textarea, input:not([type=hidden]), select');
      if (input) input.focus();
    }
  });
  document.addEventListener('change', function (event) {
    if (event.target.matches('select[data-autosubmit]')) event.target.form.submit();
  });

  // ------------------------------------------------------------ 휴대폰 화면: 메뉴 열기·닫기
  function setMenu(sidebar, open) {
    sidebar.classList.toggle('open', open);
    var button = sidebar.querySelector('[data-menu-toggle]');
    if (button) button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-menu-toggle]');
    if (!button) return;
    var sidebar = button.closest('.sidebar');
    if (sidebar) setMenu(sidebar, !sidebar.classList.contains('open'));
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var sidebar = document.querySelector('.sidebar.open');
    if (!sidebar) return;
    setMenu(sidebar, false);
    var button = sidebar.querySelector('[data-menu-toggle]');
    if (button) button.focus();
  });

  // ------------------------------------------------------------ 폼셋 줄 추가·삭제
  // <tbody data-formset="접두어"> + <template id="접두어-empty"> + <button data-add-row="접두어">
  function changed(element) {
    element.dispatchEvent(new CustomEvent('formset:change', { bubbles: true }));
  }
  document.addEventListener('click', function (event) {
    var add = event.target.closest('[data-add-row]');
    if (add) {
      var prefix = add.dataset.addRow;
      var body = document.querySelector('[data-formset="' + prefix + '"]');
      var total = document.getElementById('id_' + prefix + '-TOTAL_FORMS');
      var template = document.getElementById(prefix + '-empty');
      if (!body || !total || !template) return;
      var max = parseInt(body.dataset.max || '1000', 10);
      var alive = body.querySelectorAll('tr.form-row:not(.is-deleted)').length;
      if (alive >= max) {
        window.alert('최대 ' + max + '개까지 넣을 수 있습니다.');
        return;
      }
      var index = parseInt(total.value, 10);
      body.insertAdjacentHTML('beforeend', template.innerHTML.replace(/__prefix__/g, String(index)));
      total.value = index + 1;
      var first = body.lastElementChild.querySelector('select, input:not([type=hidden])');
      if (first) first.focus();
      changed(body);
      return;
    }
    var remove = event.target.closest('[data-remove-row]');
    if (remove) {
      var row = remove.closest('tr');
      var box = row.querySelector('input[type=checkbox][name$="-DELETE"]');
      var deleted = !row.classList.contains('is-deleted');
      row.classList.toggle('is-deleted', deleted);
      if (box) box.checked = deleted;
      remove.textContent = deleted ? '되살리기' : '삭제';
      changed(row);
    }
  });

  function sumOf(body, selector) {
    var sum = 0;
    var count = 0;
    body.querySelectorAll('tr.form-row:not(.is-deleted)').forEach(function (row) {
      count += 1;
      var input = row.querySelector(selector);
      var value = input ? parseFloat(String(input.value).replace(/,/g, '')) : NaN;
      if (!isNaN(value)) sum += value;
    });
    return { sum: Math.round(sum * 100) / 100, count: count };
  }

  // ------------------------------------------------------------ KPI 목표: 가중치 합계 · 지표 고르기
  var goals = document.querySelector('[data-formset="goals"]');
  if (goals) {
    var templatesNode = document.getElementById('kpi-templates');
    var library = templatesNode ? JSON.parse(templatesNode.textContent) : {};
    var updateGoals = function () {
      var result = sumOf(goals, '.js-weight');
      var out = document.getElementById('weight-sum');
      out.textContent = result.sum + '%';
      out.className = result.sum === 100 ? 'sum-ok' : 'sum-bad';
      document.getElementById('goal-count').textContent = result.count;
    };
    goals.addEventListener('input', updateGoals);
    goals.addEventListener('formset:change', updateGoals);
    goals.addEventListener('change', function (event) {
      var select = event.target.closest('.js-template');
      if (!select) return;
      var data = library[select.value];
      if (!data) return;
      var row = select.closest('tr');
      row.querySelector('.js-title').value = data.title;
      row.querySelector('.js-unit').value = data.unit;
      row.querySelector('.js-direction').value = data.direction;
      row.querySelector('.js-description').value = data.description || '';
    });
    updateGoals();
  }

  // ------------------------------------------------------------ 등급 기준: 비율 합계
  var grades = document.querySelector('[data-formset="grades"]');
  if (grades) {
    var updateGrades = function () {
      var result = sumOf(grades, '.js-ratio');
      var out = document.getElementById('ratio-sum');
      out.textContent = result.sum + '%';
      out.className = result.sum === 100 ? 'sum-ok' : 'sum-bad';
    };
    grades.addEventListener('input', updateGrades);
    grades.addEventListener('formset:change', updateGrades);
    updateGrades();
  }

  // ------------------------------------------------------------ 점수 계산 (scoring.py 와 같은 규칙)
  function achievement(direction, target, actual) {
    if (target <= 0) {
      var met = direction === 'LOWER' ? actual <= target : actual >= target;
      return met ? 100 : 0;
    }
    var rate = direction === 'LOWER' ? (2 - actual / target) * 100 : (actual / target) * 100;
    rate = Math.min(Math.max(rate, 0), 99999.9);
    return Math.round(rate * 10 + 1e-9) / 10;
  }
  function parseNumber(value) {
    var text = String(value == null ? '' : value).replace(/,/g, '').trim();
    if (text === '') return null;
    var number = Number(text);
    return isFinite(number) ? number : NaN;
  }

  // 실적 입력: 달성률·KPI 점수·정량 점수 미리보기
  var actuals = document.querySelector('[data-actuals]');
  if (actuals) {
    var cap = parseFloat(actuals.dataset.cap);
    var refreshActuals = function () {
      var weighted = 0;
      var weights = 0;
      var complete = true;
      actuals.querySelectorAll('tr[data-goal]').forEach(function (row) {
        var input = row.querySelector('.js-actual');
        var actual = parseNumber(input ? input.value : row.dataset.actual);
        var rate = actual === null || isNaN(actual)
          ? null
          : achievement(row.dataset.direction, parseFloat(row.dataset.target), actual);
        var score = rate === null ? null : Math.min(Math.max(rate, 0), cap);
        row.querySelector('.js-rate').textContent = rate === null ? '–' : rate.toFixed(1) + '%';
        row.querySelector('.js-score').textContent = score === null ? '–' : score.toFixed(2);
        var fill = row.querySelector('.meter > i');
        if (fill) fill.style.width = (rate === null ? 0 : Math.min(rate, 150) / 150 * 100) + '%';
        var weight = parseInt(row.dataset.weight, 10);
        if (score === null) complete = false;
        else { weighted += score * weight; weights += weight; }
      });
      var out = document.getElementById('kpi-preview');
      if (out) out.textContent = complete && weights > 0 ? (weighted / weights).toFixed(2) : '–';
    };
    actuals.addEventListener('input', refreshActuals);
    refreshActuals();
  }

  // 평가: 역량 점수·종합 점수 미리보기
  var evaluation = document.querySelector('[data-evaluation]');
  if (evaluation) {
    var points = JSON.parse(evaluation.dataset.points);
    var quant = parseInt(evaluation.dataset.quant, 10);
    var kpi = evaluation.dataset.kpi === '' ? null : parseFloat(evaluation.dataset.kpi);
    var items = parseInt(evaluation.dataset.items, 10);
    var refreshEvaluation = function () {
      var checked = evaluation.querySelectorAll('input.js-rating:checked');
      var competency = null;
      if (items > 0 && checked.length === items) {
        var total = 0;
        checked.forEach(function (input) { total += points[input.value]; });
        competency = total / items;
      }
      // 오른쪽 카드(#…-preview)와 휴대폰 화면 아래 막대(.js-…-preview)를 함께 바꾼다.
      var compText = competency === null ? (items ? checked.length + ' / ' + items + '개 평가' : '–') : competency.toFixed(2);
      document.querySelectorAll('#comp-preview, .js-comp-preview').forEach(function (out) { out.textContent = compText; });
      var result = null;
      if (quant >= 100) result = kpi;
      else if (quant <= 0) result = competency;
      else if (kpi !== null && competency !== null) result = (kpi * quant + competency * (100 - quant)) / 100;
      var totalText = result === null ? '–' : result.toFixed(2);
      document.querySelectorAll('#total-preview, .js-total-preview').forEach(function (out) { out.textContent = totalText; });
    };
    evaluation.addEventListener('change', refreshEvaluation);
    refreshEvaluation();
  }

  // ------------------------------------------------------------ 등급 조정: 바꾼 줄 표시, 사유 필수
  document.querySelectorAll('[data-calibration] tr[data-auto]').forEach(function (row) {
    var select = row.querySelector('select');
    var note = row.querySelector('input[name^="note-"]');
    if (!select || !note) return;
    var sync = function () {
      var adjusted = select.value !== row.dataset.auto;
      row.classList.toggle('is-adjusted', adjusted);
      note.required = adjusted;
      note.placeholder = adjusted ? '조정 사유 (필수)' : '';
    };
    select.addEventListener('change', sync);
    sync();
  });

  // ------------------------------------------------------------ 차트 툴팁 (값이 먼저, 설명이 뒤)
  var tip = document.createElement('div');
  tip.className = 'tooltip hidden';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  function place(x, y) {
    var width = tip.offsetWidth;
    var left = Math.min(Math.max(8, x + 12), window.innerWidth - width - 8);
    var top = Math.max(8, y - tip.offsetHeight - 10);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function show(element, x, y) {
    var parts = element.dataset.tip.split('|');
    tip.textContent = '';
    var strong = document.createElement('strong');
    strong.textContent = parts[0];
    tip.appendChild(strong);
    if (parts[1]) tip.appendChild(document.createTextNode(parts[1]));
    tip.classList.remove('hidden');
    place(x, y);
  }
  document.addEventListener('pointerover', function (event) {
    var element = event.target.closest('[data-tip]');
    if (element) show(element, event.clientX, event.clientY);
  });
  document.addEventListener('pointermove', function (event) {
    if (!tip.classList.contains('hidden')) place(event.clientX, event.clientY);
  });
  document.addEventListener('pointerout', function (event) {
    var element = event.target.closest('[data-tip]');
    if (element && !element.contains(event.relatedTarget)) tip.classList.add('hidden');
  });
  document.addEventListener('focusin', function (event) {
    var element = event.target.closest('[data-tip]');
    if (!element) return;
    var rect = element.getBoundingClientRect();
    show(element, rect.left + rect.width / 2, rect.top);
  });
  document.addEventListener('focusout', function () { tip.classList.add('hidden'); });
})();
