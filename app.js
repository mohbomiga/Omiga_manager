
(() => {
  const $ = (id) => document.getElementById(id);

  const money = n =>
    new Intl.NumberFormat('ar-EG', {maximumFractionDigits:2})
      .format(Number(n || 0)) + ' ج.م';

  const today = new Date();

  const dateISO = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const monthISO = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

  $('entryDate').value = dateISO(today);
  $('monthFilter').value = monthISO(today);

  $('todayText').textContent =
    today.toLocaleDateString('ar-EG', {
      weekday:'long',
      year:'numeric',
      month:'long',
      day:'numeric'
    });

  const url = window.OMIGA_SUPABASE_URL;
  const key = window.OMIGA_SUPABASE_ANON_KEY;

  const configured =
    url && key &&
    !url.startsWith('PASTE_') &&
    !key.startsWith('PASTE_');

  if (!configured || !window.supabase) {
    $('setup').classList.remove('hidden');
    $('auth').classList.remove('hidden');
    $('authMsg').textContent =
      'التطبيق جاهز كواجهة، ويتبقى إعداد الاتصال السحابي من ملف config.js.';
    $('loginBtn').disabled = $('signupBtn').disabled = true;
    return;
  }

  const client = window.supabase.createClient(url, key);

  let currentKind = 'repair';
  let allRows = [];

  const kindNames = {
    repair:'صيانة',
    sale:'بيع منتج',
    expense:'مصروف',
    purchase:'شراء بضاعة'
  };

  function setKind(kind) {
    currentKind = kind;
    $('kind').value = kind;

    document.querySelectorAll('.tab').forEach(b =>
      b.classList.toggle('active', b.dataset.kind === kind)
    );

    $('amountLabel').firstChild.textContent =
      kind === 'expense' || kind === 'purchase'
        ? 'المبلغ المدفوع (جنيه)'
        : 'المبلغ المقبوض (جنيه)';

    $('costLabel').classList.toggle(
      'hidden',
      kind === 'expense' || kind === 'purchase'
    );

    $('categoryLabel').classList.toggle(
      'hidden',
      kind === 'purchase'
    );

    $('cost').value = '0';
    $('cost').required = false;
  }

  document.querySelectorAll('.tab').forEach(b =>
    b.addEventListener('click', () => setKind(b.dataset.kind))
  );

  setKind('repair');

  function showAuth() {
    $('auth').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }

  function showApp() {
    $('auth').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
    loadRows();
  }

  // إنشاء حساب جديد
  $('signupBtn').onclick = async () => {
    $('authMsg').textContent = 'جارٍ إنشاء الحساب...';

    try {
      const {data, error} = await client.auth.signUp({
        email: $('email').value.trim(),
        password: $('password').value
      });

      if (error) throw error;

      $('authMsg').textContent =
        data.user && data.session
          ? 'تم إنشاء الحساب وتسجيل الدخول بنجاح.'
          : 'تم إنشاء الحساب. افحص بريدك الإلكتروني لتأكيد الحساب إذا طُلب منك ذلك.';

    } catch (err) {
      console.error('OMIGA signup error:', err);
      $('authMsg').textContent =
        'خطأ أثناء إنشاء الحساب: ' + (err?.message || String(err));
    }
  };

  // تسجيل الدخول
  $('loginBtn').onclick = async () => {
    $('authMsg').textContent = 'جارٍ تسجيل الدخول...';

    try {
      const {error} = await client.auth.signInWithPassword({
        email: $('email').value.trim(),
        password: $('password').value
      });

      if (error) throw error;

      $('authMsg').textContent = '';

    } catch (err) {
      console.error('OMIGA login error:', err);
      $('authMsg').textContent =
        'خطأ أثناء تسجيل الدخول: ' + (err?.message || String(err));
    }
  };

  $('logoutBtn').onclick = async () => {
    await client.auth.signOut();
    showAuth();
  };

  client.auth.onAuthStateChange((_event, session) => {
    if (session) showApp();
    else showAuth();
  });

  async function loadRows() {
    const {data, error} = await client
      .from('omiga_entries')
      .select('*')
      .order('entry_date', {ascending:false})
      .order('created_at', {ascending:false});

    if (error) {
      $('formMsg').textContent = error.message;
      return;
    }

    allRows = data || [];
    render();
  }

  function render() {
    const month = $('monthFilter').value;

    const rows = allRows.filter(r =>
      (r.entry_date || '').slice(0,7) === month
    );

    const revenue = rows
      .filter(r => ['repair','sale'].includes(r.kind))
      .reduce((s,r) => s + Number(r.amount), 0);

    const costs = rows
      .filter(r => ['repair','sale'].includes(r.kind))
      .reduce((s,r) => s + Number(r.cost), 0);

    const expenses = rows
      .filter(r => r.kind === 'expense')
      .reduce((s,r) => s + Number(r.amount), 0);

    $('revenue').textContent = money(revenue);
    $('costs').textContent = money(costs);
    $('expenses').textContent = money(expenses);
    $('net').textContent = money(revenue - costs - expenses);

    $('entriesBody').innerHTML = rows.length
      ? rows.map(r => `<tr>
          <td>${escapeHtml(r.entry_date)}</td>
          <td>${kindNames[r.kind] || r.kind}</td>
          <td>${escapeHtml(r.description)}</td>
          <td>${money(r.amount)}</td>
          <td>${money(r.cost)}</td>
          <td><button class="delete" data-id="${r.id}" title="حذف">×</button></td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="muted center">لا توجد حركات في الشهر ده</td></tr>';

    document.querySelectorAll('.delete').forEach(b => {
      b.onclick = () => deleteRow(b.dataset.id);
    });
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c]));
  }

  $('entryForm').onsubmit = async e => {
    e.preventDefault();

    const amount = Number($('amount').value);
    const cost = Number($('cost').value || 0);

    if (amount < 0 || cost < 0) {
      $('formMsg').textContent = 'من فضلك أدخل أرقام صحيحة.';
      return;
    }

    $('formMsg').textContent = 'جارٍ الحفظ...';

    const payload = {
      kind: currentKind,
      description: $('description').value.trim(),
      amount,
      cost,
      category: $('category').value,
      entry_date: $('entryDate').value,
      notes: $('notes').value.trim()
    };

    const {error} = await client
      .from('omiga_entries')
      .insert(payload);

    if (error) {
      $('formMsg').textContent = error.message;
      return;
    }

    $('entryForm').reset();
    $('entryDate').value = dateISO(new Date());
    $('cost').value = '0';

    $('formMsg').textContent = 'تم حفظ الحركة بنجاح.';

    await loadRows();
  };

  async function deleteRow(id) {
    if (!confirm('متأكد إنك عايز تحذف الحركة دي؟')) return;

    const {error} = await client
      .from('omiga_entries')
      .delete()
      .eq('id', id);

    if (error) {
      alert(error.message);
    } else {
      await loadRows();
    }
  }

  $('monthFilter').onchange = render;

  $('csvBtn').onclick = () => {
    const month = $('monthFilter').value;

    const rows = allRows.filter(r =>
      (r.entry_date || '').slice(0,7) === month
    );

    const csv = [
      ['التاريخ','النوع','البيان','المبلغ','التكلفة','التصنيف','ملاحظات'],
      ...rows.map(r => [
        r.entry_date,
        kindNames[r.kind],
        r.description,
        r.amount,
        r.cost,
        r.category || '',
        r.notes || ''
      ])
    ]
    .map(row =>
      row.map(v => '"' + String(v ?? '').replace(/"/g,'""') + '"').join(',')
    )
    .join('\n');

    const blob = new Blob(
      ['\ufeff' + csv],
      {type:'text/csv;charset=utf-8;'}
    );

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `OMIGA-${month}.csv`;
    a.click();

    URL.revokeObjectURL(a.href);
  };

  client.auth.getSession().then(({data}) => {
    if (data.session) showApp();
    else showAuth();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

})();
