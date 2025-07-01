// --- GLOBAL DEĞİŞKENLER VE İLK AYARLAR ---
let editingIndex = null;
let entries = JSON.parse(localStorage.getItem('entries')) || [];
let filteredEntries = []; 
let pendingAction = null;
let pendingIndex = null;
let topFirmNames = [];
let currentPage = 1;
const rowsPerPage = 50; 

const conversionRates = { TL: 1, USD: 32.8, EUR: 35.4 };

// --- OLAY DİNLEYİCİLERİ ---
document.addEventListener('DOMContentLoaded', () => {
    entries.sort((a, b) => parseDate(b.date) - parseDate(a.date));

    if (localStorage.getItem('nightMode') === 'true') document.body.classList.add('night-mode');
    
    document.getElementById('toggle-all-status').addEventListener('click', toggleAllMuhasebeStatus);
    
    filterTable();
    updateUI();
    document.getElementById('page-input').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            goToPage();
        }
    });
});

document.getElementById('mode-toggle-btn').addEventListener('click', toggleMode);
document.getElementById('confirm-yes').addEventListener('click', handleConfirmation);
document.getElementById('confirm-no').addEventListener('click', closeConfirmation);

// --- ANA GÜNCELLEME FONKSİYONU ---
function updateUI() {
    updateDashboardCards();
    loadCompanyLastEntry();
    updateTotalAmounts();
    updateTodayTotals();
    updateDatalists();
    renderFirmPerformanceChart();
    renderFirmRevenueShareChart();
    applyStaggeredAnimation();
}

function applyStaggeredAnimation() {
    document.querySelectorAll('.card').forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
    });
}


// --- DASHBOARD KARTLARI FONKSİYONU ---
function updateDashboardCards() {
    const totalJobs = entries.length;
    document.getElementById('stat-total-jobs').textContent = totalJobs;

    const now = new Date();
    const thisMonthEntries = entries.filter(e => {
        const entryDate = parseDate(e.date);
        return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
    });

    if (thisMonthEntries.length > 0) {
        // --- Metrik 1: Adet Bazında En İyi Firma ---
        const companyCounts = thisMonthEntries.reduce((acc, entry) => {
            acc[entry.firmName] = (acc[entry.firmName] || 0) + 1;
            return acc;
        }, {});
        const topCompanyByCount = Object.entries(companyCounts).sort(([,a],[,b]) => b-a)[0][0];
        document.getElementById('stat-top-company-by-count').textContent = topCompanyByCount;

        // --- Metrik 2: Tutar Bazında En İyi Firma (TL Cinsinden) ---
        const companyValues = thisMonthEntries.reduce((acc, entry) => {
            const valueInTL = (parseFloat(entry.amount) || 0) * (conversionRates[entry.currency] || 1);
            acc[entry.firmName] = (acc[entry.firmName] || 0) + valueInTL;
            return acc;
        }, {});
        const topCompanyByValue = Object.entries(companyValues).sort(([,a],[,b]) => b-a)[0][0];
        document.getElementById('stat-top-company-by-value').textContent = topCompanyByValue;
        
    } else {
        // Bu ay veri yoksa her iki kartı da sıfırla
        document.getElementById('stat-top-company-by-count').textContent = '-';
        document.getElementById('stat-top-company-by-value').textContent = '-';
    }
}


// --- SAYFALAMA (PAGINATION) MANTIĞI ---
function loadEntries() {
    const tableBody = document.getElementById('work-table-body');
    tableBody.innerHTML = '';
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedEntries = Array.isArray(filteredEntries) ? filteredEntries.slice(startIndex, endIndex) : [];

    if (paginatedEntries.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 40px; font-size: 1.2em; color: #999;"><i class="fas fa-folder-open fa-2x"></i><br><br>Gösterilecek veri bulunamadı.</td></tr>`;
    } else {
        paginatedEntries.forEach((entry) => {
            const originalIndex = entries.indexOf(entry);
            const totals = getFirmTotals(entry.firmName);
            const starHTML = topFirmNames.includes(entry.firmName) ? '<span class="star-blink">★</span>' : '';
            const islemText = entry.islem && entry.islem.length > 0 ? `(${entry.islem.join(', ')})` : '';
            const rowHTML = `
                <tr>
                    <td>${entry.date}</td>
                    <td style="cursor:pointer;" onclick="showJobDetails(${originalIndex})">${entry.description} <small style="color:gray">${islemText}</small></td>
                    <td><span class="firm-link" onclick="showCompanyDetails('${entry.firmName}')">${entry.firmName} ${starHTML}</span></td>
                    <td style="color: var(--success-color); font-weight:bold;">${(entry.amount || 0).toFixed(2)} ${entry.currency}</td>
                    <td><div style="font-weight: bold;">TL: ${totals.TL.toFixed(2)}<br>USD: ${totals.USD.toFixed(2)}<br>EUR: ${totals.EUR.toFixed(2)}</div></td>
                    <td>${entry.programName}</td>
                    <td>${entry.muhasebeyeVerildi ? `<span style="color:var(--success-color); cursor:pointer;" onclick="toggleMuhasebe(${originalIndex})"><i class="fas fa-check-circle"></i> Fatura Edildi</span>` : `<span style="color:var(--warning-color); cursor:pointer;" onclick="toggleMuhasebe(${originalIndex})"><i class="fas fa-hourglass-half"></i> Bekliyor</span>`}</td>
                    <td class="action-buttons">
                        <button class="edit-btn" onclick="openConfirmation('edit', ${originalIndex})" aria-label="Düzenle"><i class="fas fa-edit"></i></button>
                        <button class="delete-btn" onclick="openConfirmation('delete', ${originalIndex})" aria-label="Sil"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
            tableBody.insertAdjacentHTML('beforeend', rowHTML);
        });
    }
    renderPaginationControls();
}

function renderPaginationControls() {
    const pageInfo = document.getElementById('page-info');
    const pageInput = document.getElementById('page-input');
    const paginationControls = document.getElementById('pagination-controls');
    
    if (!filteredEntries || filteredEntries.length === 0) {
        paginationControls.style.display = 'none';
        return;
    }
    
    const totalPages = Math.ceil(filteredEntries.length / rowsPerPage);

    if (totalPages <= 1) {
        paginationControls.style.display = 'none';
        return;
    }
    
    paginationControls.style.display = 'flex';
    pageInfo.textContent = `Sayfa ${currentPage} / ${totalPages}`;
    pageInput.value = ''; 
    pageInput.max = totalPages;

    document.getElementById('first-page-btn').disabled = currentPage === 1;
    document.getElementById('prev-page-btn').disabled = currentPage === 1;
    document.getElementById('next-page-btn').disabled = currentPage === totalPages;
    document.getElementById('last-page-btn').disabled = currentPage === totalPages;
}

function goToFirstPage() { currentPage = 1; loadEntries(); }
function goToLastPage() { currentPage = Math.ceil(filteredEntries.length / rowsPerPage); loadEntries(); }
function prevPage() { if (currentPage > 1) { currentPage--; loadEntries(); } }
function nextPage() { if (currentPage < Math.ceil(filteredEntries.length / rowsPerPage)) { currentPage++; loadEntries(); } }

function goToPage() {
    const pageInput = document.getElementById('page-input');
    const pageNum = parseInt(pageInput.value);
    const totalPages = Math.ceil(filteredEntries.length / rowsPerPage);
    if (pageNum >= 1 && pageNum <= totalPages) {
        currentPage = pageNum;
        loadEntries();
    } else {
        showToast(`Lütfen 1 ile ${totalPages} arasında bir sayfa girin.`, 'error');
        pageInput.value = '';
    }
}

// --- Filtreleme ve Sıralama ---
function filterTable() {
    currentPage = 1;
    document.getElementById('toggle-all-status').checked = false; 
    const filterText = document.getElementById('filter-firm').value.toLowerCase();
    const startDate = document.getElementById('search-start-date').value;
    const endDate = document.getElementById('search-end-date').value;
    filteredEntries = entries.filter(entry => {
        const entryDate = parseDate(entry.date);
        const firmMatch = entry.firmName.toLowerCase().includes(filterText);
        const programMatch = entry.programName.toLowerCase().includes(filterText);
        const dateMatch = (!startDate || entryDate >= new Date(startDate)) && (!endDate || entryDate <= new Date(endDate));
        return (firmMatch || programMatch) && dateMatch;
    });
    sortTable(false); 
}

function sortTable(resetPage = true) {
    if(resetPage) {
       currentPage = 1;
    }
    document.getElementById('toggle-all-status').checked = false; 
    const sortBy = document.getElementById('sort-by').value;
    filteredEntries.sort((a, b) => {
        switch (sortBy) {
            case 'date-asc': return parseDate(a.date) - parseDate(b.date);
            case 'firm': return a.firmName.localeCompare(b.firmName);
            case 'program': return a.programName.localeCompare(b.programName);
            case 'date-desc': default: return parseDate(b.date) - parseDate(a.date);
        }
    });
    loadEntries();
}

// --- FİRMA CİRO PASTA GRAFİĞİ ---
function renderFirmRevenueShareChart() {
    const firmValues = {};
    entries.forEach(entry => {
        const valueTL = (parseFloat(entry.amount) || 0) * (conversionRates[entry.currency] || 1);
        firmValues[entry.firmName] = (firmValues[entry.firmName] || 0) + valueTL;
    });

    const sortedFirms = Object.entries(firmValues).sort(([,a],[,b]) => b-a);
    let labels = [];
    let data = [];
    const colors = ['#3B5998', '#F7C548', '#5CB85C', '#D9534F', '#5BC0DE', '#F0AD4E', '#777'];
    const topFirms = sortedFirms.slice(0, 6);
    const otherFirms = sortedFirms.slice(6);
    topFirms.forEach(([name, value]) => { labels.push(name); data.push(value); });

    if (otherFirms.length > 0) {
        labels.push('Diğer');
        data.push(otherFirms.reduce((sum, [,value]) => sum + value, 0));
    }
    
    const ctx = document.getElementById('firm-revenue-share-chart').getContext('2d');
    if (window.firmRevenueShareChart) window.firmRevenueShareChart.destroy();
    
    const isNightMode = document.body.classList.contains('night-mode');
    const labelColor = isNightMode ? '#e0e0e0' : '#333';
    
    window.firmRevenueShareChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                label: 'Firma Ciro Payı', data: data, backgroundColor: colors,
                borderColor: document.body.classList.contains('night-mode') ? '#2c2c2c' : '#FFFFFF', borderWidth: 2
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { color: labelColor } } }
        }
    });
}

// --- Toplu Durum Değiştirme Fonksiyonu ---
function toggleAllMuhasebeStatus() {
    const isChecked = document.getElementById('toggle-all-status').checked;
    const actionText = isChecked ? "Fatura Edildi" : "Bekliyor";
    
    if (filteredEntries.length === 0) {
        showToast('İşaretlenecek kayıt bulunmuyor.', 'warning');
        document.getElementById('toggle-all-status').checked = false;
        return;
    }

    if (confirm(`Görünen ${filteredEntries.length} kaydın durumunu "${actionText}" olarak ayarlamak istediğinize emin misiniz?`)) {
        filteredEntries.forEach(filteredEntry => {
            const originalEntry = entries.find(entry => entry === filteredEntry);
            if (originalEntry) {
                originalEntry.muhasebeyeVerildi = isChecked;
            }
        });

        localStorage.setItem('entries', JSON.stringify(entries));
        loadEntries(); 
        showToast('Tüm görünen kayıtların durumu güncellendi.', 'success');
    } else {
        document.getElementById('toggle-all-status').checked = !isChecked;
    }
}


// --- Diğer Tüm Fonksiyonlar ---
function toggleMode() { document.body.classList.toggle('night-mode'); localStorage.setItem('nightMode', document.body.classList.contains('night-mode')); updateUI(); }
function showToast(message, type = 'success') { const toast = document.getElementById('toast'); toast.textContent = message; toast.className = `toast show ${type}`; setTimeout(() => { toast.className = 'toast'; }, 3000); }
function showLoader(show) { document.getElementById('loader-overlay').style.display = show ? 'flex' : 'none'; }
function openModal(modalId) { document.getElementById(modalId).classList.add('active'); document.getElementById('modal-overlay').classList.add('active'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('active'); if (!document.querySelector('.modal.active')) { document.getElementById('modal-overlay').classList.remove('active'); } }
function formatDate(dateObj = new Date()) { return dateObj.toLocaleDateString('tr-TR'); }
function parseDate(dateStr) { if (!dateStr || typeof dateStr !== 'string') return new Date(0); const parts = dateStr.split('.'); if (parts.length !== 3) return new Date(0); return new Date(parts[2], parts[1] - 1, parts[0]); }
function addDataAndNew() { addData(true); }
function addData(clearAfterSave = false) { const firmName = document.getElementById('firm-name').value.trim(); const description = document.getElementById('work-description').value.trim(); const amount = parseFloat(document.getElementById('amount').value); const currency = document.getElementById('currency').value; const programName = document.getElementById('program-name').value.trim(); const selectedIslem = Array.from(document.querySelectorAll('input[name="islem"]:checked')).map(cb => cb.value); if (!firmName || !description || isNaN(amount) || amount <= 0 || !programName) { showToast('Lütfen tüm alanları geçerli şekilde doldurun.', 'error'); return; } const isDuplicateProgram = entries.some((entry, idx) => idx !== editingIndex && entry.programName.toLowerCase() === programName.toLowerCase()); if (isDuplicateProgram) { showToast("Bu program kodu zaten kullanılmış.", 'error'); return; } showLoader(true); setTimeout(() => { const newEntry = { date: formatDate(), firmName, description, amount, currency, programName, islem: selectedIslem, muhasebeyeVerildi: editingIndex !== null ? entries[editingIndex].muhasebeyeVerildi : false }; if (editingIndex !== null) { entries[editingIndex] = newEntry; showToast('Veri başarıyla güncellendi!'); } else { entries.unshift(newEntry); showToast('Veri başarıyla eklendi!'); } localStorage.setItem('entries', JSON.stringify(entries)); editingIndex = null; document.getElementById('submit-button').innerHTML = '<i class="fas fa-plus-circle"></i> Veri Girişi'; filterTable(); updateUI(); if (clearAfterSave) { clearForm(); document.getElementById('firm-name').focus(); } showLoader(false); }, 500); }
function deleteEntry(index) { entries.splice(index, 1); localStorage.setItem('entries', JSON.stringify(entries)); filterTable(); updateUI(); showToast('Kayıt silindi!'); }
function editEntry(index) { editingIndex = index; const entry = entries[index]; document.getElementById('firm-name').value = entry.firmName; document.getElementById('work-description').value = entry.description; document.getElementById('amount').value = entry.amount; document.getElementById('currency').value = entry.currency; document.getElementById('program-name').value = entry.programName; document.querySelectorAll('input[name="islem"]').forEach(cb => { cb.checked = entry.islem && entry.islem.includes(cb.value); }); document.getElementById('submit-button').innerHTML = '<i class="fas fa-save"></i> Güncelle'; window.scrollTo(0, 0); document.getElementById('firm-name').focus(); showToast('Düzenleme moduna geçildi.', 'warning'); }
function clearForm() { document.getElementById('firm-name').value = ''; document.getElementById('work-description').value = ''; document.getElementById('amount').value = ''; document.getElementById('program-name').value = ''; document.querySelectorAll('input[name="islem"]').forEach(cb => cb.checked = false); editingIndex = null; document.getElementById('submit-button').innerHTML = '<i class="fas fa-plus-circle"></i> Veri Girişi'; }
function verifyPIN() { const pin = prompt('Tüm verileri silmek için PIN kodunu giriniz:'); if (pin === '1234') { if(confirm("EMİN MİSİNİZ? Bu işlem geri alınamaz!")) { entries = []; localStorage.removeItem('entries'); filterTable(); updateUI(); showToast('Tüm veriler kalıcı olarak silindi!', 'error'); } else { showToast('İşlem iptal edildi.', 'warning'); } } else if (pin) { showToast('Yanlış PIN!', 'error'); } }
function toggleMuhasebe(index) { entries[index].muhasebeyeVerildi = !entries[index].muhasebeyeVerildi; localStorage.setItem('entries', JSON.stringify(entries)); loadEntries(); showToast('Durum güncellendi.'); }
function updateDatalists() { const firmNames = [...new Set(entries.map(e => e.firmName))]; const workDescs = [...new Set(entries.map(e => e.description))]; document.getElementById('firmNames').innerHTML = firmNames.map(name => `<option value="${name}"></option>`).join(''); document.getElementById('workDescriptions').innerHTML = workDescs.map(desc => `<option value="${desc}"></option>`).join(''); }
function updateTotalAmounts() { let totals = { TL: 0, USD: 0, EUR: 0 }; entries.forEach(entry => totals[entry.currency] += (parseFloat(entry.amount) || 0)); document.getElementById('total-usd').textContent = totals.USD.toFixed(2); document.getElementById('total-tl').textContent = totals.TL.toFixed(2); document.getElementById('total-eur').textContent = totals.EUR.toFixed(2); }
function updateTodayTotals() { const today = formatDate(); let todayTotals = { TL: 0, USD: 0, EUR: 0 }; entries.filter(e => e.date === today).forEach(entry => todayTotals[entry.currency] += (parseFloat(entry.amount) || 0)); document.getElementById('today-usd').textContent = todayTotals.USD.toFixed(2); document.getElementById('today-tl').textContent = todayTotals.TL.toFixed(2); document.getElementById('today-eur').textContent = todayTotals.EUR.toFixed(2); }

function loadCompanyLastEntry() { 
    const container = document.getElementById('company-last-entry'); 
    const firms = [...new Set(entries.map(e => e.firmName))]; 
    if (firms.length === 0) { 
        container.innerHTML = '<p>Henüz firma verisi yok.</p>'; 
        return; 
    } 
    const firmData = firms.map(firm => { 
        const firmEntries = entries.filter(e => e.firmName === firm); 
        const lastEntryDate = firmEntries.length > 0 
            ? firmEntries.map(e => parseDate(e.date)).reduce((max, current) => current > max ? current : max) 
            : new Date(0); 
        return { name: firm, lastDate: lastEntryDate }; 
    }).sort((a, b) => b.lastDate - a.lastDate); 
    
    let tableHTML = `<table><thead><tr><th>Firma</th><th>Son Giriş Tarihi</th><th>Geçen Süre (Gün)</th></tr></thead><tbody>`; 
    firmData.forEach(({ name, lastDate }) => { 
        const daysAgo = lastDate.getTime() === new Date(0).getTime() ? "N/A" : Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24)); 
        tableHTML += `<tr><td><span class="firm-link" onclick="showCompanyDetails('${name}')">${name}</span></td><td>${daysAgo === "N/A" ? "Giriş Yok" : formatDate(lastDate)}</td><td>${daysAgo}</td></tr>`; 
    }); 
    tableHTML += `</tbody></table>`; 
    container.innerHTML = tableHTML; 
}

function exportToCSV() { if (entries.length === 0) return showToast('Dışa aktarılacak veri yok.', 'warning'); let csvContent = 'data:text/csv;charset=utf-8,'; csvContent += `"Tarih","Yapılan İş","Firma","Fiyat","Para Birimi","Program","Muhasebeye Verildi","Seçilen İşlemler"\n`; entries.forEach(entry => { const row = [entry.date, `"${entry.description}"`, `"${entry.firmName}"`, entry.amount, entry.currency, `"${entry.programName}"`, entry.muhasebeyeVerildi ? 'Evet' : 'Hayır', `"${(entry.islem || []).join('|')}"`]; csvContent += row.join(',') + '\r\n'; }); const encodedUri = encodeURI(csvContent); const link = document.createElement('a'); link.setAttribute('href', encodedUri); link.setAttribute('download', `is_takip_yedek_${new Date().toISOString().split('T')[0]}.csv`); document.body.appendChild(link); link.click(); document.body.removeChild(link); }
function importCSV(event) { const file = event.target.files[0]; if (!file) return; showLoader(true); const reader = new FileReader(); reader.onload = function (e) { const text = e.target.result; const lines = text.trim().split(/\r\n|\n/); const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '')); const dataLines = lines.slice(1); let processedEntries = []; let currentIndex = 0; function processChunk() { const BATCH_END_TIME = performance.now() + 16; while (performance.now() < BATCH_END_TIME && currentIndex < dataLines.length) { const line = dataLines[currentIndex]; if (line) { try { const values = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g).map(v => v.replace(/"/g, '')); const entry = {}; headers.forEach((header, i) => { let key; switch (header) { case 'Tarih': key = 'date'; break; case 'Yapılan İş': key = 'description'; break; case 'Firma': key = 'firmName'; break; case 'Fiyat': key = 'amount'; break; case 'Para Birimi': key = 'currency'; break; case 'Program': key = 'programName'; break; case 'Muhasebeye Verildi': key = 'muhasebeyeVerildi'; break; case 'Seçilen İşlemler': key = 'islem'; break; } if (key) { let finalValue = values[i]; if (key === 'amount') { finalValue = parseFloat(finalValue) || 0; } else if (key === 'muhasebeyeVerildi') { finalValue = (typeof finalValue === 'string' && finalValue.trim().toLowerCase() === 'evet'); } else if (key === 'islem') { finalValue = finalValue ? finalValue.split('|') : []; } entry[key] = finalValue; } }); if (entry.firmName) { processedEntries.push(entry); } } catch (err) { console.warn(`CSV satırı ${currentIndex + 2} okunamadı:`, line, err); } } currentIndex++; } if (currentIndex < dataLines.length) { setTimeout(processChunk, 0); } else { entries = processedEntries; entries.sort((a, b) => parseDate(b.date) - parseDate(a.date)); localStorage.setItem('entries', JSON.stringify(entries)); filterTable(); updateUI(); showLoader(false); showToast(`CSV başarıyla yüklendi! ${entries.length} kayıt işlendi.`); } } processChunk(); }; reader.onerror = function() { showLoader(false); showToast('Dosya okunurken bir hata oluştu.', 'error'); }; reader.readAsText(file, 'UTF-8'); event.target.value = ''; }
function openConfirmation(action, index) { pendingAction = action; pendingIndex = index; openModal('confirmation-modal'); }
function handleConfirmation() { if (pendingAction === 'delete') { deleteEntry(pendingIndex); } else if (pendingAction === 'edit') { editEntry(pendingIndex); } closeConfirmation(); }
function closeConfirmation() { pendingAction = null; pendingIndex = null; closeModal('confirmation-modal'); }

function showCompanyDetails(firmName) { 
    const firmEntries = entries.filter(entry => entry.firmName === firmName); 
    const totals = getFirmTotals(firmName); 
    const lastEntryDate = firmEntries.length > 0 
        ? firmEntries.map(e => parseDate(e.date)).reduce((max, d) => d > max ? d : max) 
        : null; 
    const content = `<h3>${firmName} Detayları</h3><p><strong>Toplam İş Tutarı:</strong></p><div class="total-box"><p>TL: ${totals.TL.toFixed(2)}</p><p>USD: ${totals.USD.toFixed(2)}</p><p>EUR: ${totals.EUR.toFixed(2)}</p></div><p><strong>Son Veri Girişi:</strong> ${lastEntryDate ? formatDate(lastEntryDate) : 'Yok'}</p>`; 
    document.getElementById('company-details-content').innerHTML = content; 
    openModal('company-details-modal'); 
}

function closeCompanyDetails() { closeModal('company-details-modal'); }
function showJobDetails(index) { const entry = entries[index]; const islemText = entry.islem && entry.islem.length > 0 ? entry.islem.join(', ') : 'Belirtilmemiş'; const content = `<h3>İş Detayı: ${entry.programName}</h3><p><strong>Tarih:</strong> ${entry.date}</p><p><strong>Firma:</strong> ${entry.firmName}</p><p><strong>Açıklama:</strong> ${entry.description}</p><p><strong>Seçili İşlemler:</strong> ${islemText}</p>`; document.getElementById('job-details-content').innerHTML = content; openModal('job-details-modal'); }
function closeJobDetails() { closeModal('job-details-modal'); }
function getFirmTotals(firmName) { let totals = { TL: 0, USD: 0, EUR: 0 }; entries.filter(e => e.firmName === firmName).forEach(entry => totals[entry.currency] += (parseFloat(entry.amount) || 0)); return totals; }
function renderFirmPerformanceChart() { const firmValues = {}; const firms = [...new Set(entries.map(e => e.firmName))]; firms.forEach(firm => { firmValues[firm] = entries.filter(e => e.firmName === firm).reduce((sum, entry) => sum + ((parseFloat(entry.amount) || 0) * (conversionRates[entry.currency] || 1)), 0); }); const sortedFirms = Object.entries(firmValues).sort(([,a],[,b]) => b-a); topFirmNames = sortedFirms.slice(0, 3).map(f => f[0]); const labels = sortedFirms.map(item => item[0]); const dataValues = sortedFirms.map(item => item[1]); renderPerFirmCurrencyTotals(sortedFirms); const ctx = document.getElementById('firm-performance-chart').getContext('2d'); if (window.firmPerformanceChart) window.firmPerformanceChart.destroy(); const isNightMode = document.body.classList.contains('night-mode'); const gridColor = isNightMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'; const labelColor = isNightMode ? '#e0e0e0' : '#333'; window.firmPerformanceChart = new Chart(ctx, { type: 'bar', data: { labels: labels, datasets: [{ label: 'Toplam Parasal Değer (TL cinsinden)', data: dataValues, backgroundColor: 'rgba(59, 89, 152, 0.7)', borderColor: 'rgba(59, 89, 152, 1)', borderWidth: 1, borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: labelColor }, grid: { color: gridColor } }, x: { ticks: { color: labelColor }, grid: { color: gridColor } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (context) { return `Toplam Değer: ${context.raw.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}`; } } } } } }); }
function renderPerFirmCurrencyTotals(sortedFirms) { const container = document.getElementById('currency-totals'); container.innerHTML = sortedFirms.map(([firm, value]) => { const totals = getFirmTotals(firm); const starHTML = topFirmNames.includes(firm) ? '<span class="star-blink">★</span>' : ''; return `<div class="currency-box"><strong>${firm} ${starHTML}</strong><br><small>TL: ${totals.TL.toFixed(2)} | USD: ${totals.USD.toFixed(2)} | EUR: ${totals.EUR.toFixed(2)}</small></div>`; }).join(''); }
const scrollToTopBtn = document.getElementById('scroll-to-top'); window.onscroll = function() { if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) { scrollToTopBtn.style.display = "block"; } else { scrollToTopBtn.style.display = "none"; } }; scrollToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
function setDateFilter(startDate, endDate) { document.getElementById('search-start-date').valueAsDate = startDate; document.getElementById('search-end-date').valueAsDate = endDate; filterTable(); }
function setFilterToThisMonth() { const now = new Date(); setDateFilter(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)); }
function setFilterToLastMonth() { const now = new Date(); setDateFilter(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)); }
function setFilterToThisYear() { const now = new Date(); setDateFilter(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31)); }
function clearDateFilters() { document.getElementById('search-start-date').value = ''; document.getElementById('search-end-date').value = ''; filterTable(); }
