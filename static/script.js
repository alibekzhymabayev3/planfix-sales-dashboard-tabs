document.addEventListener('DOMContentLoaded', () => {
    loadData();

    document.getElementById('btn-sync').addEventListener('click', () => {
        const btn = document.getElementById('btn-sync');
        btn.disabled = true;
        btn.innerText = 'Запускаем обновление...';

        fetch('/api/sync', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    pollUntilReady();
                } else {
                    alert('Ошибка при обновлении: ' + data.error);
                    btn.disabled = false;
                    btn.innerText = '🔄 Обновить данные';
                }
            })
            .catch(err => {
                alert('Ошибка сети при обновлении');
                console.error(err);
                btn.disabled = false;
                btn.innerText = '🔄 Обновить данные';
            });
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabName = btn.getAttribute('data-tab');
            document.getElementById(`tab-content-${tabName}`).classList.add('active');
        });
    });
});

// Поллинг /api/status пока сервер обновляет данные в фоне
function pollUntilReady() {
    const btn = document.getElementById('btn-sync');
    const syncLabel = document.getElementById('last-sync-time');
    let dots = 0;

    const interval = setInterval(() => {
        dots = (dots + 1) % 4;
        btn.innerText = 'Загрузка из Planfix' + '.'.repeat(dots);

        fetch('/api/status')
            .then(res => res.json())
            .then(data => {
                if (!data.is_loading) {
                    clearInterval(interval);
                    btn.disabled = false;
                    btn.innerText = '🔄 Обновить данные';
                    loadData();
                } else if (data.last_sync) {
                    syncLabel.innerText = 'Обновляется...';
                }
            })
            .catch(() => {
                clearInterval(interval);
                btn.disabled = false;
                btn.innerText = '🔄 Обновить данные';
            });
    }, 2000);
}

function loadData() {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                document.getElementById('last-sync-time').innerText = 'Ошибка: ' + data.error;
                return;
            }

            renderDashboard(data.excel_sheet, data.planfix_fact || {});

            const syncLabel = document.getElementById('last-sync-time');
            if (data.is_loading) {
                syncLabel.innerText = 'Загрузка данных из Planfix...';
                // Автополлинг при первом открытии страницы
                pollUntilReady();
            } else if (data.last_sync) {
                syncLabel.innerText = 'Обновлено из Планфикса: ' + data.last_sync;
            } else {
                syncLabel.innerText = 'Загружено';
            }
        })
        .catch(err => {
            console.error("Error fetching data:", err);
            document.getElementById('last-sync-time').innerText = 'Ошибка загрузки';
        });
}

function parseValue(val) {
    if (val === null || val === undefined || isNaN(val) || val === "") return 0;
    if (typeof val === 'string') val = val.replace(/\s/g, '');
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
}

function formatNumber(num) {
    if (num === 0) return "-";
    return new Intl.NumberFormat('ru-RU').format(Math.round(num));
}

function formatDiff(val) {
    if (val === 0) return "-";
    let str = new Intl.NumberFormat('ru-RU').format(Math.round(val));
    if (val > 0) return "+" + str;
    return str;
}

function renderDashboard(sheetData, planfixData) {
    if (!sheetData) return;
    renderDashboardV2(sheetData, planfixData);
    renderDashboardV1(sheetData, planfixData);
}

// ================= V2 =================
function renderDashboardV2(sheetData, planfixData) {
    const categories = [
        {name: "Алюм, м2", optRow: 3, planfixName: "Алюм"},
        {name: "ПВХ, м2",  optRow: 4, planfixName: "ПВХ"},
        {name: "СП, м2",   optRow: 5, planfixName: "СП"},
        {name: "НВФ, м2",  optRow: 6, planfixName: "НВФ"}
    ];
    const months = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь","Итого за 12 мес"];

    const tbodyFact   = document.querySelector('#v2-table-fact tbody');
    const tbodyOpt    = document.querySelector('#v2-table-opt tbody');
    const tbodyCumFact = document.querySelector('#v2-table-cumulative-fact tbody');
    const tbodyCumOpt  = document.querySelector('#v2-table-cumulative-opt tbody');
    tbodyFact.innerHTML = tbodyOpt.innerHTML = tbodyCumFact.innerHTML = tbodyCumOpt.innerHTML = '';

    let totalOpt = 0, totalFact = 0;
    let dataMap = {opt: {}, fact: {}};
    let factMoneyByMonth = {}, moneyOptByMonth = {};

    for (let m = 1; m <= 12; m++) {
        factMoneyByMonth[m] = 0;
        categories.forEach(cat => {
            if (planfixData[m] && planfixData[m][cat.planfixName])
                factMoneyByMonth[m] += planfixData[m][cat.planfixName].sum || 0;
        });
    }

    categories.forEach(cat => {
        dataMap.fact[cat.name] = [];
        let rFact = document.createElement('tr');
        rFact.innerHTML = `<td>${cat.name}</td>`;
        let factYearTotal = 0;
        for (let m = 1; m <= 12; m++) {
            let v = 0;
            if (planfixData[m] && planfixData[m][cat.planfixName]) v = planfixData[m][cat.planfixName].m2 || 0;
            dataMap.fact[cat.name][m] = v; factYearTotal += v;
            rFact.innerHTML += `<td>${formatNumber(v)}</td>`;
        }
        rFact.innerHTML += `<td><strong>${formatNumber(factYearTotal)}</strong></td>`;
        tbodyFact.appendChild(rFact); totalFact += factYearTotal;
    });

    let mrFact = document.createElement('tr'); mrFact.style.background = '#fce4d6';
    mrFact.innerHTML = `<td><strong>Факт Техновид, в тенге</strong></td>`;
    let mfY = 0;
    for (let m = 1; m <= 12; m++) { mfY += factMoneyByMonth[m]; mrFact.innerHTML += `<td><strong>${formatNumber(factMoneyByMonth[m])}</strong></td>`; }
    mrFact.innerHTML += `<td><strong>${formatNumber(mfY)}</strong></td>`;
    tbodyFact.insertBefore(mrFact, tbodyFact.firstChild);

    categories.forEach(cat => {
        dataMap.opt[cat.name] = [];
        let rOpt = document.createElement('tr'); rOpt.innerHTML = `<td>${cat.name}</td>`;
        let oY = 0;
        for (let m = 1; m <= 12; m++) { let v = parseValue(sheetData[cat.optRow][m+1]); dataMap.opt[cat.name][m] = v; oY += v; rOpt.innerHTML += `<td>${formatNumber(v)}</td>`; }
        rOpt.innerHTML += `<td><strong>${formatNumber(oY)}</strong></td>`;
        tbodyOpt.appendChild(rOpt); totalOpt += oY;
    });
    let mrOpt = document.createElement('tr'); mrOpt.style.background = '#e6f4ea';
    mrOpt.innerHTML = `<td><strong>План, в тенге</strong></td>`;
    let moY = 0;
    for (let m = 1; m <= 12; m++) { let v = parseValue(sheetData[7][m+1]); moneyOptByMonth[m] = v; moY += v; mrOpt.innerHTML += `<td><strong>${formatNumber(v)}</strong></td>`; }
    mrOpt.innerHTML += `<td><strong>${formatNumber(moY)}</strong></td>`;
    tbodyOpt.appendChild(mrOpt);

    let lastFM = 0;
    for (let m = 1; m <= 12; m++) if (planfixData[m]) lastFM = m;

    let rCF = document.createElement('tr'); rCF.style.background = '#fce4d6';
    rCF.innerHTML = `<td><strong>Факт Техновид, в тенге</strong></td>`;
    let cf = 0;
    for (let m = 1; m <= 12; m++) {
        if (m <= lastFM) { cf += factMoneyByMonth[m]||0; rCF.innerHTML += `<td><strong>${formatNumber(cf)}</strong></td>`; }
        else rCF.innerHTML += `<td>-</td>`;
    }
    rCF.innerHTML += `<td><strong>${lastFM > 0 ? formatNumber(cf) : '-'}</strong></td>`;
    tbodyCumFact.appendChild(rCF);

    let rCO = document.createElement('tr'); rCO.style.background = '#e2efda';
    rCO.innerHTML = `<td><strong>План Оптимист, в тенге</strong></td>`;
    let co = 0;
    for (let m = 1; m <= 12; m++) { co += moneyOptByMonth[m]||0; rCO.innerHTML += `<td><strong>${formatNumber(co)}</strong></td>`; }
    rCO.innerHTML += `<td><strong>${formatNumber(co)}</strong></td>`;
    tbodyCumOpt.appendChild(rCO);

    document.getElementById('v2-val-opt-m2').innerText = formatNumber(totalOpt);
    document.getElementById('v2-val-fact-m2').innerText = formatNumber(totalFact);
    const pct = totalOpt > 0 ? Math.round(totalFact / totalOpt * 100) : 0;
    document.getElementById('v2-val-pct-opt').innerText = pct > 0 ? pct + "%" : "--";
}

// ================= V1 =================
function renderDashboardV1(sheetData, planfixData) {
    const categories = [
        {name: "Алюм, м2", optRow: 3, realRow: 12, planfixName: "Алюм"},
        {name: "ПВХ, м2",  optRow: 4, realRow: 13, planfixName: "ПВХ"},
        {name: "СП, м2",   optRow: 5, realRow: 14, planfixName: "СП"},
        {name: "НВФ, м2",  optRow: 6, realRow: 15, planfixName: "НВФ"}
    ];

    const tbodyOpt  = document.querySelector('#v1-table-opt tbody');
    const tbodyReal = document.querySelector('#v1-table-real tbody');
    const tbodyFact = document.querySelector('#v1-table-fact tbody');
    const tbodyDiffOpt  = document.querySelector('#v1-table-diff-opt tbody');
    const tbodyDiffReal = document.querySelector('#v1-table-diff-real tbody');
    const tbodyCum  = document.querySelector('#v1-table-cumulative tbody');
    [tbodyOpt,tbodyReal,tbodyFact,tbodyDiffOpt,tbodyDiffReal,tbodyCum].forEach(t => { if(t) t.innerHTML=''; });

    let totO=0,totR=0,totF=0;
    let factMoneyByMonth={}, moneyOptByMonth={}, moneyRealByMonth={};
    let dm={opt:{},real:{},fact:{}};

    for (let m=1;m<=12;m++) {
        factMoneyByMonth[m]=0;
        categories.forEach(cat => {
            if (planfixData[m] && planfixData[m][cat.planfixName])
                factMoneyByMonth[m] += planfixData[m][cat.planfixName].sum||0;
        });
    }

    categories.forEach(cat => {
        dm.opt[cat.name]=[]; dm.real[cat.name]=[]; dm.fact[cat.name]=[];
        let rO=document.createElement('tr'); rO.innerHTML=`<td>${cat.name}</td>`;
        let rR=document.createElement('tr'); rR.innerHTML=`<td>${cat.name}</td>`;
        let rF=document.createElement('tr'); rF.innerHTML=`<td>${cat.name}</td>`;
        let oY=0,rY=0,fY=0;
        for (let m=1;m<=12;m++) {
            let ov=parseValue(sheetData[cat.optRow][m+1]); dm.opt[cat.name][m]=ov; oY+=ov; rO.innerHTML+=`<td>${formatNumber(ov)}</td>`;
            let rv=parseValue(sheetData[cat.realRow][m+1]); dm.real[cat.name][m]=rv; rY+=rv; rR.innerHTML+=`<td>${formatNumber(rv)}</td>`;
            let fv=0; if(planfixData[m]&&planfixData[m][cat.planfixName]) fv=planfixData[m][cat.planfixName].m2||0;
            dm.fact[cat.name][m]=fv; fY+=fv; rF.innerHTML+=`<td>${formatNumber(fv)}</td>`;
        }
        rO.innerHTML+=`<td><strong>${formatNumber(oY)}</strong></td>`; tbodyOpt.appendChild(rO); totO+=oY;
        rR.innerHTML+=`<td><strong>${formatNumber(rY)}</strong></td>`; tbodyReal.appendChild(rR); totR+=rY;
        rF.innerHTML+=`<td><strong>${formatNumber(fY)}</strong></td>`; tbodyFact.appendChild(rF); totF+=fY;
    });

    let mrO=document.createElement('tr'); mrO.style.background='#e6f4ea'; mrO.innerHTML=`<td><strong>План, в тенге</strong></td>`;
    let mrR=document.createElement('tr'); mrR.style.background='#e6f4ea'; mrR.innerHTML=`<td><strong>План, в тенге</strong></td>`;
    let oMY=0,rMY=0;
    for (let m=1;m<=12;m++) {
        let vo=parseValue(sheetData[7][m+1]); moneyOptByMonth[m]=vo; oMY+=vo; mrO.innerHTML+=`<td><strong>${formatNumber(vo)}</strong></td>`;
        let vr=parseValue(sheetData[16][m+1]); moneyRealByMonth[m]=vr; rMY+=vr; mrR.innerHTML+=`<td><strong>${formatNumber(vr)}</strong></td>`;
    }
    mrO.innerHTML+=`<td><strong>${formatNumber(oMY)}</strong></td>`; tbodyOpt.appendChild(mrO);
    mrR.innerHTML+=`<td><strong>${formatNumber(rMY)}</strong></td>`; tbodyReal.appendChild(mrR);

    let mrF=document.createElement('tr'); mrF.style.background='#fce4d6'; mrF.innerHTML=`<td><strong>Факт Техновид, в тенге</strong></td>`;
    let fMY=0;
    for (let m=1;m<=12;m++) { fMY+=factMoneyByMonth[m]; mrF.innerHTML+=`<td><strong>${formatNumber(factMoneyByMonth[m])}</strong></td>`; }
    mrF.innerHTML+=`<td><strong>${formatNumber(fMY)}</strong></td>`;
    tbodyFact.insertBefore(mrF,tbodyFact.firstChild);

    // Отклонения
    function buildDiffRows(tbody, planMoneyMap, planDmKey) {
        let dMR=document.createElement('tr'); dMR.style.background='#ddebf7'; dMR.innerHTML=`<td><strong>Договора, в тенге</strong></td>`;
        let dMY=0;
        for (let m=1;m<=12;m++) {
            if (planfixData[m]) { let d=factMoneyByMonth[m]-planMoneyMap[m]; dMY+=d; dMR.innerHTML+=`<td class="${d<0?'val-negative':(d>0?'val-positive':'')}"><strong>${formatDiff(d)}</strong></td>`; }
            else dMR.innerHTML+=`<td>-</td>`;
        }
        dMR.innerHTML+=`<td class="${dMY<0?'val-negative':''}"><strong>${formatDiff(dMY)}</strong></td>`;
        tbody.appendChild(dMR);
        categories.forEach(cat => {
            let r=document.createElement('tr'); r.innerHTML=`<td>${cat.name}</td>`;
            let yT=0;
            for (let m=1;m<=12;m++) {
                if (planfixData[m]) { let d=dm.fact[cat.name][m]-dm[planDmKey][cat.name][m]; yT+=d; r.innerHTML+=`<td class="${d<0?'val-negative':(d>0?'val-positive':'')}">${formatDiff(d)}</td>`; }
                else r.innerHTML+=`<td>-</td>`;
            }
            r.innerHTML+=`<td class="${yT<0?'val-negative':''}"><strong>${formatDiff(yT)}</strong></td>`;
            tbody.appendChild(r);
        });
    }
    buildDiffRows(tbodyDiffOpt, moneyOptByMonth, 'opt');
    buildDiffRows(tbodyDiffReal, moneyRealByMonth, 'real');

    // Накопительные
    let lastFM=0; for (let m=1;m<=12;m++) if (planfixData[m]) lastFM=m;
    let rCO=document.createElement('tr'); rCO.style.background='#e2efda'; rCO.innerHTML=`<td><strong>План Оптимист, в тенге</strong></td>`;
    let rCR=document.createElement('tr'); rCR.style.background='#ddebf7'; rCR.innerHTML=`<td><strong>План Реалист, в тенге</strong></td>`;
    let rCF=document.createElement('tr'); rCF.style.background='#fce4d6'; rCF.innerHTML=`<td><strong>Факт Техновид, в тенге</strong></td>`;
    let co=0,cr=0,cf=0;
    for (let m=1;m<=12;m++) {
        co+=moneyOptByMonth[m]||0; rCO.innerHTML+=`<td><strong>${formatNumber(co)}</strong></td>`;
        cr+=moneyRealByMonth[m]||0; rCR.innerHTML+=`<td><strong>${formatNumber(cr)}</strong></td>`;
        if (m<=lastFM) { cf+=factMoneyByMonth[m]||0; rCF.innerHTML+=`<td><strong>${formatNumber(cf)}</strong></td>`; }
        else rCF.innerHTML+=`<td>-</td>`;
    }
    rCO.innerHTML+=`<td><strong>${formatNumber(co)}</strong></td>`; tbodyCum.appendChild(rCO);
    rCR.innerHTML+=`<td><strong>${formatNumber(cr)}</strong></td>`; tbodyCum.appendChild(rCR);
    rCF.innerHTML+=`<td><strong>${lastFM>0?formatNumber(cf):'-'}</strong></td>`; tbodyCum.appendChild(rCF);

    document.getElementById('v1-val-opt-m2').innerText = formatNumber(totO);
    document.getElementById('v1-val-real-m2').innerText = formatNumber(totR);
    document.getElementById('v1-val-fact-m2').innerText = formatNumber(totF);
}
