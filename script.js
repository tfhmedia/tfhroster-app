document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        roles: [
            { name: 'Main Camera', isMultiple: false, count: 1 },
            { name: 'Second Camera', isMultiple: false, count: 1 },
            { name: 'ProPresenter', isMultiple: false, count: 1 },
            { name: 'Live Monitoring', isMultiple: false, count: 1 },
        ],
        dates: [],
        teamMembers: [],
        roster: {},
        unavailability: {},
        settings: { allowDuplicates: false }
    };
    let history = [];
    let historyIndex = -1;
    let calendarState = { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDates: new Set() };
    let selectedMemberForCalendar = null;
    let dragSrcItem = null;
    let draggedRoleRow = null;
    const MAX_HISTORY = 20;

    // Expose loadState for app-controller
    window.reloadAppState = async () => {
        const loadStateFunc = document.querySelector('script[src="script.js"]')?.loadState;
        if (typeof window._scriptLoadState === 'function') {
            await window._scriptLoadState();
            if (typeof window._scriptRenderAll === 'function') {
                window._scriptRenderAll();
            }
        }
    };

    // --- DOM Elements ---
    const els = {
        rosterTable: document.getElementById('roster-table-container'),
        teamModal: document.getElementById('team-modal'),
        unavailabilityModal: document.getElementById('unavailability-modal'),
        rolesCheckboxes: document.getElementById('roles-checkboxes'),
        teamList: document.getElementById('team-members-list'),
        volunteerSelect: document.getElementById('volunteer-select'),
        volunteerDisplay: document.getElementById('volunteer-assignments-display'),
        memberForm: document.getElementById('add-member-form'),
        cancelEditBtn: document.getElementById('cancel-edit-button'),
        rolesListModal: document.getElementById('modal-roles-list'),
        unavMemberSelect: document.getElementById('unavailability-member-select'),
        calGrid: document.getElementById('calendar-grid'),
        calDates: document.getElementById('calendar-selected-dates'),
        calTitle: document.getElementById('calendar-month-year'),
        notifyArea: document.getElementById('notification-area')
    };

    // --- Helper Functions ---
    const showNotification = (message, isError = false) => {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 transform translate-x-10 opacity-0 ${isError ? 'bg-red-600' : 'bg-emerald-600'}`;
        els.notifyArea.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-10', 'opacity-0');
        });

        setTimeout(() => {
            notification.classList.add('opacity-0', 'translate-x-10');
            notification.addEventListener('transitionend', () => notification.remove());
        }, 3000);
    };

    // Save state to Firebase
    const saveState = async () => {
        if (!window.dbService || !window.dbService.currentTeamId) {
            console.warn('Cannot save: No team selected');
            return;
        }

        try {
            await window.dbService.saveRoster({
                roster: state.roster,
                dates: state.dates,
                unavailability: state.unavailability
            });
            await window.dbService.updateTeamRoles(state.roles);
            await window.dbService.updateTeamSettings(state.settings);
        } catch (error) {
            console.error('Error saving state:', error);
            showNotification('Failed to save changes', true);
        }
    };

    const pushToHistory = () => {
        if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
        history.push(JSON.parse(JSON.stringify(state.roster)));
        if (history.length > MAX_HISTORY) history.shift();
        historyIndex = history.length - 1;
        updateUndoRedoButtons();
    };

    const updateUndoRedoButtons = () => {
        const undoBtn = document.getElementById('undo-button');
        const redoBtn = document.getElementById('redo-button');
        if (undoBtn) undoBtn.disabled = historyIndex <= 0;
        if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
    };

    // --- RENDER LOGIC ---
    const renderRosterTable = () => {
        if (state.dates.length === 0 || state.roles.length === 0) {
            els.rosterTable.innerHTML = `<div class="p-12 text-center text-gray-500 bg-gray-800/50 rounded-xl border border-gray-800 border-dashed"><p>Roster is empty. Start by adding roles and dates.</p></div>`;
            return;
        }
        const sortedDates = [...state.dates].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Table Construction
        let html = `<table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-gray-800">
                            <th class="p-4 font-semibold text-gray-400 text-xs uppercase tracking-wider bg-gray-900 sticky left-0 z-20 w-48 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)]">Role</th>`;

        sortedDates.forEach(d => {
            const pU = state.teamMembers.filter(m => m.unavailableDates.includes(d.date)).map(m => m.name);
            const gU = state.unavailability[d.date] || [];
            const uCount = new Set([...pU, ...gU]).size;
            const dateObj = new Date(d.date + 'T00:00:00');

            html += `<th class="p-4 min-w-[200px] border-l border-gray-800 group relative" data-date-header="${d.date}" data-event-header="${d.event}">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="font-bold text-gray-200 text-sm">${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                                <div class="font-medium text-gray-500 text-xs mt-0.5">${d.event || dateObj.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                            </div>
                            <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button data-generate-for-date="${d.date}" class="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded" title="Generate this column">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                </button>
                                <button data-date-to-delete="${d.date}" class="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded" title="Delete column">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                        ${uCount > 0 ? `<div class="absolute bottom-1 right-2 text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">${uCount} unav</div>` : ''}
                    </th>`;
        });
        html += `</tr></thead><tbody>`;

        state.roles.forEach(role => {
            html += `<tr class="role-row bg-gray-900 border-b border-gray-800 hover:bg-gray-800/30 group" data-role-row="${role.name}">
                        <th class="p-4 text-gray-300 font-medium text-sm sticky left-0 bg-gray-900 group-hover:bg-gray-800/30 z-20 w-48 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.5)] cursor-grab active:cursor-grabbing border-r border-gray-800" draggable="true">
                            <div class="flex justify-between items-center">
                                <span>${role.name} ${role.isMultiple ? `<span class="text-xs text-gray-500 ml-1">(${role.count})</span>` : ''}</span>
                                <button data-role-to-delete="${role.name}" class="p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </div>
                        </th>`;

            sortedDates.forEach(d => {
                const date = d.date;
                let assigned = state.roster[date]?.[role.name] || [];
                const dU = state.unavailability[date] || [];

                // Populate Dropdown Options
                const availableMembers = state.teamMembers.filter(member =>
                    member.roles.includes(role.name) &&
                    !member.unavailableDates.includes(date) &&
                    !dU.includes(member.name)
                );

                let assignedElsewhere = [];
                if (!state.settings.allowDuplicates) {
                    Object.keys(state.roster[date] || {}).forEach(rName => {
                        if (rName !== role.name) assignedElsewhere = assignedElsewhere.concat(state.roster[date][rName]);
                    });
                }

                const dropdownMembers = [...new Set([...availableMembers.map(m => m.name), ...assigned])].sort();
                const allM = state.teamMembers.map(m => m.name);

                if (assigned.length === 0) assigned = [''];

                html += `<td class="roster-cell p-3 border-l border-gray-800 align-top min-w-[200px]" data-role="${role.name}" data-date="${date}">`;

                assigned.forEach((mem, idx) => {
                    const isU = state.teamMembers.some(m => m.name === mem && (m.unavailableDates.includes(date) || dU.includes(mem)));
                    const isC = mem && !allM.includes(mem);

                    // Improved Styling for Inputs/Selects
                    let baseClasses = "w-full py-2 pl-3 pr-10 text-sm border rounded-lg shadow-sm appearance-none cursor-pointer transition-colors focus:ring-2 focus:ring-indigo-500/50 outline-none";
                    let normalClasses = "bg-gray-800 border-gray-700 text-white hover:border-gray-600";
                    let errorClasses = "bg-red-900/20 border-red-800/50 text-red-200";

                    let cls = `${baseClasses} ${isU ? errorClasses : normalClasses}`;
                    let inputCls = `${baseClasses} bg-gray-800 border-indigo-500/50 text-white`;

                    if (isC) cls += " hidden";

                    html += `
                            <div class="assignment-wrapper relative mb-2 group/item" draggable="true" data-role="${role.name}" data-date="${date}" data-index="${idx}">
                                <select class="${cls} roster-assignment-select" data-role="${role.name}" data-date="${date}" data-index="${idx}">
                                    <option value="" class="text-gray-500">-- Select --</option>
                                    ${dropdownMembers.map(n => {
                        let disabled = '';
                        let label = n;
                        if (assignedElsewhere.includes(n) && mem !== n) { disabled = 'disabled'; label += ' (Busy)'; }
                        return `<option value="${n}" ${mem === n ? 'selected' : ''} ${disabled}>${label}${isU && mem === n ? ' (Unav)' : ''}</option>`;
                    }).join('')}
                                    <option value="__custom_input__" class="font-semibold text-indigo-400">+ Custom Name...</option>
                                </select>
                                
                                <input type="text" value="${isC ? mem : ''}" class="custom-name-input ${isC ? 'block' : 'hidden'} ${inputCls} absolute top-0 left-0 z-10" data-role="${role.name}" data-date="${date}" data-index="${idx}" placeholder="Type name..."/>
                                
                                <div class="absolute inset-y-0 right-1 flex items-center pointer-events-none text-gray-500">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                </div>

                                <button type="button" data-role="${role.name}" data-date="${date}" data-index="${idx}" 
                                    class="absolute inset-y-0 right-1 my-auto h-6 w-6 flex items-center justify-center text-gray-500 hover:text-red-400 bg-gray-800 hover:bg-gray-700 rounded z-20 remove-assignment-btn transition-colors shadow-sm border border-gray-700 hover:border-gray-600" 
                                    title="Clear">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </div>`;
                });

                html += `<button type="button" class="add-assignment-btn w-full py-1.5 text-xs text-gray-500 border border-gray-700 border-dashed rounded hover:bg-gray-800 hover:text-indigo-400 hover:border-indigo-500/50 transition-all opacity-50 hover:opacity-100" data-role="${role.name}" data-date="${date}">+ Add Slot</button>`;
                html += `</td>`;
            });
            html += `</tr>`;
        });

        html += `</tbody></table>`;
        els.rosterTable.innerHTML = html;
        attachRosterEventListeners();
    };

    const renderRolesCheckboxes = () => {
        if (state.roles.length > 0) {
            els.rolesCheckboxes.innerHTML = state.roles.map(role => `
                        <label class="flex items-center space-x-3 p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors">
                            <input type="checkbox" name="roles" value="${role.name}" class="w-4 h-4 rounded border-gray-600 text-indigo-600 focus:ring-indigo-500/50 bg-gray-700">
                            <span class="text-sm text-gray-300 select-none">${role.name}</span>
                        </label>`).join('');
        } else {
            els.rolesCheckboxes.innerHTML = `<p class="text-gray-500 col-span-full text-sm italic">Define roles in the main dashboard first.</p>`;
        }
    };

    const renderTeamMembers = () => {
        if (state.teamMembers.length === 0) {
            document.getElementById('no-members-message').classList.remove('hidden');
            els.teamList.innerHTML = '';
        } else {
            document.getElementById('no-members-message').classList.add('hidden');
            els.teamList.innerHTML = state.teamMembers.map(member => `
                        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors group relative">
                            <div class="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button data-member-id-edit="${member.id}" class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>
                                <button data-member-id-delete="${member.id}" class="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                            </div>
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                    ${member.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div>
                                    <h4 class="font-semibold text-gray-200">${member.name}</h4>
                                    <p class="text-xs text-gray-500">${member.availability || 'Availability not set'}</p>
                                </div>
                            </div>
                            <div class="flex flex-wrap gap-1.5 mb-3">
                                ${member.roles.map(r => `<span class="text-[10px] font-medium bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full border border-gray-600">${r}</span>`).join('')}
                            </div>
                            ${member.unavailableDates.length > 0 ?
                    `<div class="pt-3 border-t border-gray-700/50">
                                    <p class="text-[10px] uppercase font-bold text-amber-500 mb-1">Unavailable</p>
                                    <div class="flex flex-wrap gap-1">
                                        ${member.unavailableDates.map(d => `<span class="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">${new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`).join('')}
                                    </div>
                                </div>` : ''}
                        </div>`).join('');
        }
        document.getElementById('team-members-heading').textContent = `Team List (${state.teamMembers.length})`;
    };

    const renderModalRolesList = () => {
        els.rolesListModal.innerHTML = state.roles.length === 0 ? `<p class="text-sm text-gray-500 italic">No roles added yet.</p>` : state.roles.map(role => `
                    <div class="bg-gray-900 border border-gray-700 p-3 rounded-lg flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <input type="text" value="${role.name}" data-original-role-name="${role.name}" class="modal-role-input flex-grow bg-transparent text-sm font-medium text-white focus:outline-none border-b border-transparent focus:border-indigo-500 px-1">
                            <button data-role-to-delete="${role.name}" class="text-gray-500 hover:text-red-400 p-1"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                        <div class="flex items-center gap-4 text-xs text-gray-400">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" data-role-multiple-toggle="${role.name}" ${role.isMultiple ? 'checked' : ''} class="rounded bg-gray-700 border-gray-600 text-indigo-500 focus:ring-indigo-500/50"> Allow Multiple
                            </label>
                            <div class="${role.isMultiple ? 'flex items-center gap-2' : 'hidden'}">
                                <span>Max:</span>
                                <select data-role-count-select="${role.name}" class="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white focus:outline-none">
                                    <option value="1" ${role.count == 1 ? 'selected' : ''}>1</option>
                                    <option value="2" ${role.count == 2 ? 'selected' : ''}>2</option>
                                    <option value="3" ${role.count == 3 ? 'selected' : ''}>3</option>
                                    <option value="4" ${role.count == 4 ? 'selected' : ''}>4</option>
                                    <option value="5" ${role.count == 5 ? 'selected' : ''}>5</option>
                                </select>
                            </div>
                        </div>
                    </div>`).join('');
    };

    const populateDropdowns = () => {
        const sM = [...state.teamMembers].sort((a, b) => a.name.localeCompare(b.name));
        const opts = '<option value="">-- Select --</option>' + sM.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        els.volunteerSelect.innerHTML = opts;
        els.unavMemberSelect.innerHTML = opts;
    };

    const renderCalendar = () => {
        const year = calendarState.year;
        const month = calendarState.month;
        els.calTitle.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        els.calGrid.innerHTML = '';
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(day => els.calGrid.innerHTML += `<div class="font-bold text-gray-500 text-xs py-2">${day}</div>`);
        for (let i = 0; i < firstDay; i++) els.calGrid.innerHTML += `<div></div>`;

        for (let day = 1; day <= daysInMonth; day++) {
            const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSel = calendarState.selectedDates.has(dStr);
            const todayStr = new Date().toISOString().slice(0, 10);
            const isToday = dStr === todayStr;

            els.calGrid.innerHTML += `
                        <button class="calendar-day aspect-square rounded-full flex items-center justify-center text-sm transition-all
                        ${isSel ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' : 'text-gray-300 hover:bg-gray-700'} 
                        ${isToday && !isSel ? 'border border-indigo-500 text-indigo-400' : ''}" 
                        data-date="${dStr}">${day}</button>`;
        }

        els.calDates.innerHTML = [...calendarState.selectedDates].sort().map(d => `
                    <span class="flex items-center gap-1.5 text-xs font-medium bg-gray-800 text-indigo-300 px-2 py-1 rounded-full border border-gray-700">
                        ${new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        <button type="button" data-deselect-date="${d}" class="hover:text-white transition-colors">&times;</button>
                    </span>`).join('') || `<span class="text-xs text-gray-600 italic px-1">No dates selected</span>`;
    };

    const generateForDate = (date) => {
        if (!state.roster[date]) state.roster[date] = {};
        const dU = state.unavailability[date] || [];
        const dayAssign = {};
        state.roles.forEach(role => {
            const avail = state.teamMembers.filter(m => m.roles.includes(role.name) && !m.unavailableDates.includes(date) && !dU.includes(m.name) && (state.settings.allowDuplicates || !dayAssign[m.name]));
            let shuff = [...avail].sort(() => 0.5 - Math.random());
            let toAssign = [];
            for (let i = 0; i < role.count && i < shuff.length; i++) {
                toAssign.push(shuff[i].name);
                if (!state.settings.allowDuplicates) dayAssign[shuff[i].name] = true;
            }
            state.roster[date][role.name] = toAssign;
        });
        pushToHistory(); updateState(state);
    };

    // Load state from Firebase
    const loadState = async () => {
        if (!window.dbService || !window.dbService.currentTeamId) {
            console.log('No team selected, using default state');
            return;
        }

        try {
            // Load team data
            const teamDoc = await window.dbService.db.collection('teams')
                .doc(window.dbService.currentTeamId).get();

            if (teamDoc.exists) {
                const data = teamDoc.data();

                // Update state from Firebase
                if (data.roles) state.roles = data.roles;
                if (data.dates) state.dates = data.dates;
                if (data.roster) state.roster = data.roster;
                if (data.settings) state.settings = data.settings;
                if (data.unavailability) state.unavailability = data.unavailability;
            }

            // Load team members
            const members = await window.dbService.getTeamMembers();
            state.teamMembers = members;

            // Init missing properties
            if (!state.unavailability) state.unavailability = {};
            state.teamMembers.forEach(m => { if (!m.unavailableDates) m.unavailableDates = []; });
            state.roles = state.roles.map(r => typeof r === 'string' ? { name: r, isMultiple: false, count: 1 } : r);
            history = [JSON.parse(JSON.stringify(state.roster))];
            historyIndex = 0;

            console.log('State loaded from Firebase');
        } catch (error) {
            console.error('Error loading state:', error);
            showNotification('Failed to load data', true);
        }
    };

    // Expose globally for app-controller
    window._scriptLoadState = loadState;

    const renderAll = () => {
        renderRosterTable();
        renderRolesCheckboxes();
        renderTeamMembers();
        renderModalRolesList();
        populateDropdowns();
        document.getElementById('allow-duplicates-toggle').checked = state.settings.allowDuplicates;
    };

    // Expose globally for app-controller
    window._scriptRenderAll = renderAll;

    const updateState = async (newState) => {
        state = newState;
        await saveState();
        renderAll();
    };

    // --- Handlers & Listeners ---
    const handleAssignmentChange = (e) => {
        const select = e.target;
        const roleName = select.dataset.role, date = select.dataset.date, index = parseInt(select.dataset.index);
        const selectedValue = select.value;
        const parentDiv = select.closest('.assignment-wrapper');
        const customInput = parentDiv.querySelector('.custom-name-input');

        if (!state.roster[date]) state.roster[date] = {};
        let assignments = state.roster[date][roleName] || [];
        state.roster[date][roleName] = assignments;

        if (selectedValue === '__custom_input__') {
            customInput.classList.remove('hidden'); customInput.focus(); select.classList.add('hidden');
            return;
        }
        customInput.classList.add('hidden'); select.classList.remove('hidden');

        if (index === 0 && selectedValue === '' && assignments.length === 1) state.roster[date][roleName] = [''];
        else if (selectedValue === '') state.roster[date][roleName].splice(index, 1);
        else state.roster[date][roleName][index] = selectedValue;

        if (state.roster[date][roleName].length > 1) state.roster[date][roleName] = state.roster[date][roleName].filter(n => n !== '');

        pushToHistory(); updateState(state);
    };

    const handleCustomNameBlur = (e) => {
        const input = e.target;
        const roleName = input.dataset.role, date = input.dataset.date, index = parseInt(input.dataset.index);
        const customName = input.value.trim();
        if (!state.roster[date]) state.roster[date] = {};
        let assignments = state.roster[date][roleName] || [];
        state.roster[date][roleName] = assignments;
        state.roster[date][roleName][index] = customName || '';
        if (state.roster[date][roleName].length > 1) state.roster[date][roleName] = state.roster[date][roleName].filter(name => name !== '');

        pushToHistory(); updateState(state);
    };

    const handleRemoveAssignment = (e) => {
        const btn = e.target.closest('button');
        const roleName = btn.dataset.role, date = btn.dataset.date, index = parseInt(btn.dataset.index);
        let assignments = state.roster[date]?.[roleName] || [''];
        if (assignments.length > 1) assignments.splice(index, 1);
        else assignments[0] = '';
        if (!state.roster[date]) state.roster[date] = {};
        state.roster[date][roleName] = assignments;
        pushToHistory(); updateState(state);
    };

    const handleAddAssignment = (e) => {
        const btn = e.target.closest('button');
        const roleName = btn.dataset.role, date = btn.dataset.date;
        if (!state.roster[date]) state.roster[date] = {};
        if (!state.roster[date][roleName]) state.roster[date][roleName] = [''];
        state.roster[date][roleName].push('');
        pushToHistory(); updateState(state);
    };

    // D&D Handlers
    const handleItemDragStart = (e) => { e.stopPropagation(); dragSrcItem = e.target; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
    const handleItemDragEnd = (e) => { if (dragSrcItem) dragSrcItem.classList.remove('dragging'); dragSrcItem = null; document.querySelectorAll('.drag-over-cell').forEach(el => el.classList.remove('drag-over-cell')); };
    const handleCellDragOver = (e) => { if (dragSrcItem) { e.preventDefault(); e.currentTarget.classList.add('drag-over-cell'); } };
    const handleCellDragLeave = (e) => { e.currentTarget.classList.remove('drag-over-cell'); };
    const handleCellDrop = (e) => {
        if (dragSrcItem) {
            e.preventDefault(); e.stopPropagation();
            const destCell = e.currentTarget; destCell.classList.remove('drag-over-cell');
            const srcDate = dragSrcItem.dataset.date, srcRole = dragSrcItem.dataset.role, srcIndex = parseInt(dragSrcItem.dataset.index);
            const destDate = destCell.dataset.date, destRole = destCell.dataset.role;

            if (srcDate === destDate && srcRole === destRole) return;
            const srcVal = state.roster[srcDate][srcRole][srcIndex];
            if (!srcVal) return;

            // Swap or Move logic here (simplified for space)
            state.roster[srcDate][srcRole].splice(srcIndex, 1);
            if (state.roster[srcDate][srcRole].length === 0) state.roster[srcDate][srcRole] = [''];
            if (!state.roster[destDate]) state.roster[destDate] = {};
            if (!state.roster[destDate][destRole]) state.roster[destDate][destRole] = [];
            state.roster[destDate][destRole].push(srcVal);
            if (state.roster[destDate][destRole].length > 1) state.roster[destDate][destRole] = state.roster[destDate][destRole].filter(n => n !== '');

            pushToHistory(); updateState(state);
        }
    };

    const attachRosterEventListeners = () => {
        document.querySelectorAll('.roster-assignment-select').forEach(el => el.addEventListener('change', handleAssignmentChange));
        document.querySelectorAll('.custom-name-input').forEach(el => el.addEventListener('blur', handleCustomNameBlur));
        document.querySelectorAll('.remove-assignment-btn').forEach(el => el.addEventListener('click', handleRemoveAssignment));
        document.querySelectorAll('.add-assignment-btn').forEach(el => el.addEventListener('click', handleAddAssignment));
        document.querySelectorAll('.assignment-wrapper').forEach(el => { el.addEventListener('dragstart', handleItemDragStart); el.addEventListener('dragend', handleItemDragEnd); });
        document.querySelectorAll('.roster-cell').forEach(el => { el.addEventListener('dragover', handleCellDragOver); el.addEventListener('dragleave', handleCellDragLeave); el.addEventListener('drop', handleCellDrop); });
    };

    // Listeners
    document.getElementById('add-role-form').addEventListener('submit', e => { e.preventDefault(); const v = document.getElementById('role-name-input').value.trim(); if (v && !state.roles.some(r => r.name === v)) { state.roles.push({ name: v, isMultiple: false, count: 1 }); document.getElementById('role-name-input').value = ''; updateState(state); } });
    document.getElementById('add-date-form').addEventListener('submit', e => { e.preventDefault(); const d = document.getElementById('date-input').value; const ev = document.getElementById('event-name-input').value.trim(); if (d && !state.dates.some(dt => dt.date === d)) { state.dates.push({ date: d, event: ev }); document.getElementById('date-input').value = ''; document.getElementById('event-name-input').value = ''; updateState(state); } });
    document.getElementById('generate-roster-button').addEventListener('click', () => { state.dates.forEach(d => generateForDate(d.date)); });
    document.getElementById('clear-roster-button').addEventListener('click', () => { if (confirm("Clear Roster?")) { state.roster = {}; pushToHistory(); updateState(state); } });
    document.getElementById('save-session-button').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' })); a.download = 'roster.json'; a.click(); });
    document.getElementById('load-session-input').addEventListener('change', e => { const r = new FileReader(); r.onload = x => { state = JSON.parse(x.target.result); updateState(state); }; if (e.target.files[0]) r.readAsText(e.target.files[0]); });

    // PDF Export
    document.getElementById('download-pdf-button').addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        doc.setFontSize(18);
        doc.text('Volunteer Roster', 14, 22);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);

        if (state.dates.length === 0) {
            doc.text('No dates scheduled.', 14, 40);
            doc.save('roster.pdf');
            return;
        }

        const headers = [['Role', ...state.dates.map(d => {
            const dateObj = new Date(d.date + 'T00:00:00');
            return `${dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}\n${d.event || ''}`;
        })]];

        const data = state.roles.map(role => {
            const row = [role.name];
            state.dates.forEach(d => {
                const assigned = state.roster[d.date]?.[role.name] || [];
                row.push(assigned.join('\n'));
            });
            return row;
        });

        doc.autoTable({
            head: headers,
            body: data,
            startY: 35,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3, valign: 'middle' },
            headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold', halign: 'center' },
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            didParseCell: function (data) {
                if (data.section === 'body' && data.column.index > 0) {
                    // Optional: Add styling for cells with content
                }
            }
        });

        doc.save('roster.pdf');
    });

    // Modal Toggles
    document.getElementById('team-modal-button').addEventListener('click', () => els.teamModal.showModal());
    document.getElementById('close-modal-button').addEventListener('click', () => els.teamModal.close());
    document.getElementById('unavailability-modal-button').addEventListener('click', () => { selectedMemberForCalendar = null; els.unavMemberSelect.value = ''; calendarState.selectedDates.clear(); renderCalendar(); els.unavailabilityModal.showModal(); });
    document.getElementById('unavailability-cancel-btn').addEventListener('click', () => els.unavailabilityModal.close());
    document.getElementById('unavailability-cancel-btn-top').addEventListener('click', () => els.unavailabilityModal.close());

    // Unavailability Logic
    document.getElementById('unavailability-save-btn').addEventListener('click', () => {
        if (!selectedMemberForCalendar) return;
        const m = state.teamMembers.find(x => x.name === selectedMemberForCalendar);
        if (m) { m.unavailableDates = [...calendarState.selectedDates].sort(); updateState(state); }
        els.unavailabilityModal.close();
    });
    els.unavMemberSelect.addEventListener('change', e => { selectedMemberForCalendar = e.target.value; calendarState.selectedDates.clear(); if (selectedMemberForCalendar) { const m = state.teamMembers.find(x => x.name === selectedMemberForCalendar); if (m) m.unavailableDates.forEach(d => calendarState.selectedDates.add(d)); } renderCalendar(); });
    document.getElementById('prev-month-btn').addEventListener('click', () => { calendarState.month--; if (calendarState.month < 0) { calendarState.month = 11; calendarState.year--; } renderCalendar(); });
    document.getElementById('next-month-btn').addEventListener('click', () => { calendarState.month++; if (calendarState.month > 11) { calendarState.month = 0; calendarState.year++; } renderCalendar(); });
    els.calGrid.addEventListener('click', e => { if (e.target.classList.contains('calendar-day')) { const d = e.target.dataset.date; if (calendarState.selectedDates.has(d)) calendarState.selectedDates.delete(d); else calendarState.selectedDates.add(d); renderCalendar(); } });
    els.calDates.addEventListener('click', e => { const btn = e.target.closest('[data-deselect-date]'); if (btn) { calendarState.selectedDates.delete(btn.dataset.deselectDate); renderCalendar(); } });

    // Table Interactions
    els.rosterTable.addEventListener('click', e => {
        const gen = e.target.closest('[data-generate-for-date]'); if (gen) generateForDate(gen.dataset.generateForDate);
        const del = e.target.closest('[data-date-to-delete]'); if (del) { state.dates = state.dates.filter(d => d.date !== del.dataset.dateToDelete); delete state.roster[del.dataset.dateToDelete]; updateState(state); }
        const delR = e.target.closest('[data-role-to-delete]'); if (delR) { const r = delR.dataset.roleToDelete; state.roles = state.roles.filter(x => x.name !== r); Object.keys(state.roster).forEach(d => delete state.roster[d][r]); updateState(state); }
    });

    // Member Form
    let editingMemberId = null;

    const startEdit = (id) => {
        const member = state.teamMembers.find(m => m.id === id);
        if (!member) return;
        editingMemberId = id;
        document.getElementById('member-name').value = member.name;
        document.getElementById('member-availability').value = member.availability || '';
        document.getElementById('member-notes').value = member.notes || '';

        // Reset checkboxes
        document.querySelectorAll('input[name="roles"]').forEach(cb => cb.checked = false);
        // Check member roles
        member.roles.forEach(r => {
            const cb = document.querySelector(`input[name="roles"][value="${r}"]`);
            if (cb) cb.checked = true;
        });

        els.cancelEditBtn.classList.remove('hidden');
        els.memberForm.querySelector('button[type="submit"]').textContent = 'Update Member';
        els.memberForm.querySelector('button[type="submit"]').classList.replace('bg-emerald-600', 'bg-indigo-600');
        els.memberForm.querySelector('button[type="submit"]').classList.replace('hover:bg-emerald-500', 'hover:bg-indigo-500');
        els.memberForm.querySelector('button[type="submit"]').classList.replace('shadow-emerald-900/50', 'shadow-indigo-900/50');
    };

    const cancelEdit = () => {
        editingMemberId = null;
        els.memberForm.reset();
        els.cancelEditBtn.classList.add('hidden');
        els.memberForm.querySelector('button[type="submit"]').textContent = 'Save Member';
        els.memberForm.querySelector('button[type="submit"]').classList.replace('bg-indigo-600', 'bg-emerald-600');
        els.memberForm.querySelector('button[type="submit"]').classList.replace('hover:bg-indigo-500', 'hover:bg-emerald-500');
        els.memberForm.querySelector('button[type="submit"]').classList.replace('shadow-indigo-900/50', 'shadow-emerald-900/50');
    };

    els.cancelEditBtn.addEventListener('click', cancelEdit);

    els.memberForm.addEventListener('submit', e => {
        e.preventDefault();
        const n = document.getElementById('member-name').value.trim();
        const roles = [...document.querySelectorAll('input[name="roles"]:checked')].map(c => c.value);

        if (n) {
            if (editingMemberId) {
                // Update existing member in Firebase
                const memberData = {
                    name: n,
                    roles: roles,
                    availability: document.getElementById('member-availability').value,
                    notes: document.getElementById('member-notes').value
                };

                window.dbService.updateTeamMember(editingMemberId, memberData).then(result => {
                    if (result.success) {
                        showNotification('Member updated successfully');
                        loadState().then(() => renderAll());
                        cancelEdit();
                    } else {
                        showNotification('Failed to update member', true);
                    }
                });
            } else {
                // Add new member to Firebase
                const memberData = {
                    name: n,
                    roles: roles,
                    availability: document.getElementById('member-availability').value,
                    notes: document.getElementById('member-notes').value,
                    unavailableDates: []
                };

                window.dbService.addTeamMember(memberData).then(result => {
                    if (result.success) {
                        showNotification('Member added successfully');
                        loadState().then(() => renderAll());
                        els.memberForm.reset();
                    } else {
                        showNotification('Failed to add member', true);
                    }
                });
            }
        }
    });

    els.teamList.addEventListener('click', e => {
        const del = e.target.closest('[data-member-id-delete]');
        if (del) {
            const memberId = del.dataset.memberIdDelete;

            window.dbService.deleteTeamMember(memberId).then(result => {
                if (result.success) {
                    showNotification('Member deleted');
                    if (editingMemberId === memberId) cancelEdit();
                    loadState().then(() => renderAll());
                } else {
                    showNotification('Failed to delete member', true);
                }
            });
        }

        const edit = e.target.closest('[data-member-id-edit]');
        if (edit) {
            startEdit(edit.dataset.memberIdEdit);
        }
    });

    // Initialization - wait for Firebase auth
    const initializeApp = async () => {
        // Wait a bit for Firebase auth to settle
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (window.authService && window.authService.currentUser && window.dbService.currentTeamId) {
            await loadState();
            renderAll();
            updateUndoRedoButtons();

            // Set up real-time listener for team data
            window.dbService.listenToTeamData(async (teamData) => {
                if (teamData.roles) state.roles = teamData.roles;
                if (teamData.dates) state.dates = teamData.dates;
                if (teamData.roster) state.roster = teamData.roster;
                if (teamData.settings) state.settings = teamData.settings;
                if (teamData.unavailability) state.unavailability = teamData.unavailability;
                renderAll();
            });

            // Listen for team member changes
            window.dbService.listenToTeamMembers(async (members) => {
                state.teamMembers = members;
                renderTeamMembers();
                populateDropdowns();
            });
        } else {
            console.log('Waiting for user authentication...');
            renderAll();
        }
    };

    initializeApp();
});
