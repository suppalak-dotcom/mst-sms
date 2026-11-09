const SUPABASE_URL = 'https://npoqlqqrijlmxcjotphd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Zn9m7fej3xKnXLLw7DhH-Q_vrMJ04_C';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentPage = 1;
let pageSize = 40; // ค่าเริ่มต้นแสดงหน้าละ 40 คน


// Supabase Client ชั่วคราว (กำหนด storageKey แยก ป้องกัน Session ชนกัน)
const tempAuthClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { 
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'temp_auth_storage'
    }
});

// ฟังก์ชันสร้างแจ้งเตือนแบบ Toast สวยงาม
window.showToast = (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    // ลบทิ้งออกจาก DOM หลังจากแสดงผล 3 วินาที
    setTimeout(() => {
        toast.remove();
    }, 3000);
};


// ฟังก์ชันสลับหน้า (แก้ไข Selector #sidebar li ให้ล้างค่า active ได้ถูกต้อง)
window.switchView = (viewId, element) => {
    // 1. ซ่อนทุก view-section
    document.querySelectorAll('.view-section').forEach(view => {
        view.style.display = 'none';
    });

    // 2. แสดง view ที่เลือก
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.style.display = 'block';

    // 3. ล้างไฮไลต์ active จากแถบเมนูเดิมทั้งหมด
    document.querySelectorAll('#sidebar li, #sidebar .nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // หากไม่ได้ส่ง element มา (เรียกผ่าน JS) ให้หา Element ของเมนูนั้นให้อัตโนมัติ
    if (!element) {
        if (viewId === 'dashboardView') element = document.getElementById('menu-dashboard');
        else if (viewId === 'studentManageView') element = document.getElementById('menu-students');
        else if (viewId === 'staffManageView') element = document.getElementById('menu-staffs');
        else if (viewId === 'suspendedStudentsView') element = document.getElementById('navSuspendedStudents') || document.getElementById('menu-suspended');
        else if (viewId === 'inactiveStudentsView') element = document.getElementById('menu-inactive');
    }

    // 4. ใส่ไฮไลต์ active ให้กับเมนูที่กำลังเปิดอยู่
    if (element) {
        element.classList.add('active');
    }

    // ซ่อน Sidebar บนมือถือเมื่อกดเลือกเมนู
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar')?.classList.remove('open');
    }

    // 5. โหลดข้อมูลเฉพาะของแต่ละ View
    if (viewId === 'staffManageView') {
        switchStaffTab('teachers');
    } else if (viewId === 'dashboardView') {
        loadExecutiveDashboard();
    } else if (viewId === 'suspendedStudentsView') {
        loadSuspendedStudentsView(); // 🔥 แก้ไขจาก sectionId เป็น viewId
    } else if (viewId === 'inactiveStudentsView') {
        loadInactiveStudentsView();
    }
};

// ฟังก์ชันเปิด/ปิด Sidebar บนมือถือ
document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').style.display = 'block';
});
// กดที่พื้นที่มืดๆ เพื่อปิด Sidebar
document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').style.display = 'none';
});


// ==========================================
// ระบบล็อกอินแบบอัจฉริยะ (ดึงสิทธิ์จากตาราง DB โดยตรง)
// ==========================================
// ==========================================
// ระบบล็อกอินพร้อมดึงชื่อผู้ใช้งานแสดงแถบสถานะ
// ==========================================
document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const loginError = document.getElementById('loginError');

    loginError.style.display = 'none';

    // 1. ตรวจสอบกับ Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        // 🔥 แสดงข้อความ Error จริงจาก Supabase
        loginError.textContent = 'เข้าสู่ระบบไม่สำเร็จ: ' + error.message;
        loginError.style.display = 'block';
        return;
    }

    const userEmail = data.user.email;
    let role = 'admin';
    let grade = '';
    let room = '';
    let displayName = '';

    try {
        // 2. ดึงข้อมูลสิทธิ์จาก classroom_teachers
        const { data: teacherData } = await supabase
            .from('classroom_teachers')
            .select('grade_level, room_number, teacher_names')
            .eq('email', userEmail)
            .maybeSingle();

        if (teacherData && teacherData.grade_level && teacherData.room_number) {
            role = 'teacher';
            grade = teacherData.grade_level;
            room = teacherData.room_number;
            const names = teacherData.teacher_names || [];
            displayName = names.length > 0 ? names.join(', ') : 'ยังไม่ได้ระบุชื่อครู';
        } else {
            // 3. ดึงข้อมูลสิทธิ์จาก staff_members
            const { data: staffData } = await supabase
                .from('staff_members')
                .select('name, role')
                .eq('email', userEmail)
                .maybeSingle();

            if (staffData && staffData.role) {
                role = staffData.role;
                displayName = staffData.name || '';
            } else {
                role = data.user.user_metadata?.role || 'admin';
                displayName = data.user.user_metadata?.name || 'ผู้ดูแลระบบ';
            }
        }

        // บันทึกสิทธิ์ลง LocalStorage
        localStorage.setItem('userRole', role);
        localStorage.setItem('userGrade', grade);
        localStorage.setItem('userRoom', room);
        localStorage.setItem('userDisplayName', displayName);

        // สลับหน้าจอ
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('appSection').style.display = 'flex';
        
        applyRoleRestrictions();

    } catch (err) {
        console.error('Login process error:', err);
        loginError.textContent = 'เกิดข้อผิดพลาดในการโหลดสิทธิ์ผู้ใช้: ' + err.message;
        loginError.style.display = 'block';
    }
});



// ==========================================
// อัปเดตปุ่ม Logout 
// ==========================================
async function applyRoleRestrictions() {
    const role = localStorage.getItem('userRole') || 'teacher';
    const grade = localStorage.getItem('userGrade') || '';
    const room = localStorage.getItem('userRoom') || '';
    const displayName = localStorage.getItem('userDisplayName') || '';

    const userDisplay = document.getElementById('currentUserDisplay');
    const gradeFilter = document.getElementById('gradeFilter');
    const roomFilter = document.getElementById('roomFilter');

    // ดึงสถานะระบบส่วนกลาง
    await checkSystemStatus();

    // 1. ดึงเมนู "นักเรียนไม่มีตัว / สถานะอื่นๆ"
    const inactiveMenu = document.getElementById('menu-inactive-students');
    
    if (inactiveMenu) {
        if (role === 'teacher') {
            // ❌ ซ่อนเมนูสำหรับ "ครูประจำชั้น"
            inactiveMenu.style.display = 'none';
        } else {
            // ✅ แสดงเมนูสำหรับ Admin, Registrar (ฝ่ายทะเบียน) และ Executive (ผู้บริหาร)
            inactiveMenu.style.display = 'block';
        }
    }

    // 1. ครูประจำชั้น
    if (role === 'teacher') {
        userDisplay.innerHTML = `<b>ครูที่ปรึกษา:</b> ชั้น ${grade}/${room} <span style="color: #666; font-weight: normal;">(${displayName})</span>`;
        window.switchView('studentManageView', document.getElementById('menu-students'));

        if (gradeFilter && roomFilter) {
            gradeFilter.value = grade;
            roomFilter.value = room;
            gradeFilter.disabled = true;
            roomFilter.disabled = true;
        }
        
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) searchBtn.click();
    } 
    // 2. ผู้บริหาร (Executive)
    else if (role === 'executive') {
        userDisplay.innerHTML = `<b>ผู้บริหาร:</b> ${displayName}`;
        if (gradeFilter) gradeFilter.disabled = false;
        if (roomFilter) roomFilter.disabled = false;
        
        // สลับไปหน้าแดชบอร์ดเป็นหน้าแรกเมื่อผู้บริหารล็อกอิน
        window.switchView('dashboardView', document.getElementById('menu-dashboard'));
    } 
    // 3. เจ้าหน้าที่ทะเบียน (Registrar)
    else if (role === 'registrar') {
        userDisplay.innerHTML = `<b>เจ้าหน้าที่ทะเบียน:</b> ${displayName}`;
        if (gradeFilter) gradeFilter.disabled = false;
        if (roomFilter) roomFilter.disabled = false;
    } 
    // 4. ผู้ดูแลระบบ (Admin)
    else {
        userDisplay.innerHTML = `<b>ผู้ดูแลระบบ (Admin):</b> ${displayName}`;
        if (gradeFilter) gradeFilter.disabled = false;
        if (roomFilter) roomFilter.disabled = false;
    }

    // ควบคุมการแสดงผลเมนู Sidebar ตามสิทธิ์
    const menuDashboard = document.getElementById('menu-dashboard');
    const menuStaffs = document.getElementById('menu-staffs');
    
    // ผู้บริหาร, เจ้าหน้าที่ทะเบียน และ Admin เห็นแดชบอร์ด
    if (menuDashboard) {
        menuDashboard.style.display = (role === 'executive' || role === 'registrar' || role === 'admin') ? 'block' : 'none';
    }
    
    // เจ้าหน้าที่ทะเบียน และ Admin เห็นจัดการบุคลากร
    if (menuStaffs) {
        menuStaffs.style.display = (role === 'registrar' || role === 'admin') ? 'block' : 'none';
    }

    // ซ่อน/แสดง ปุ่มการดำเนินการอื่นๆ (เช่น เพิ่ม/ลบ/นำเข้า)
    const adminElements = document.querySelectorAll('.admin-only');
    const isAdminOrRegistrar = (role === 'admin' || role === 'registrar');
    adminElements.forEach(el => {
        el.style.display = isAdminOrRegistrar ? 'block' : 'none';
    });
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear(); 
    
    document.getElementById('loginSection').style.display = 'flex'; 
    document.getElementById('appSection').style.display = 'none';
    
    // เปลี่ยนจาก studentList เป็น studentListBody
    document.getElementById('studentListBody').innerHTML = ''; 
});

// ฟังก์ชันดึงข้อมูลนักเรียนทั้งหมดจาก Supabase แบบทะลุขีดจำกัด 1,000 คน
async function fetchAllStudentsFromDB(selectedGrade = '', selectedRoom = '') {
    let allStudents = [];
    let from = 0;
    const step = 1000;
    let keepFetching = true;

    while (keepFetching) {
        let query = supabase
            .from('students')
            .select('*')
            .order('student_code', { ascending: true })
            .range(from, from + step - 1);

        if (selectedGrade && selectedGrade !== 'all') {
            query = query.eq('grade_level', selectedGrade);
        }
        if (selectedRoom) {
            query = query.eq('room_number', selectedRoom);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching students batch:', error);
            break;
        }

        if (data && data.length > 0) {
            allStudents = allStudents.concat(data);
            // ถ้าดึงมาได้น้อยกว่า 1,000 แสดงว่าดึงหมดแล้ว ให้หยุดวนลูป
            if (data.length < step) {
                keepFetching = false;
            } else {
                from += step; // ขยับไปดึงแถวที่ 1000, 2000, ... ถัดไป
            }
        } else {
            keepFetching = false;
        }
    }

    return allStudents;
}

// ==========================================
// 1. ปุ่มค้นหานักเรียน (Search) - คลีนโค้ดส่วนวนลูปออก
// ==========================================
document.getElementById('searchBtn').addEventListener('click', async () => {
    resetSelection();
    await checkSystemStatus();

    // 🔥 1. เพิ่มบรรทัดนี้ลงไปตรงนี้เลยครับ
    await window.loadConfirmedRoomsMap();
    
    const tbody = document.getElementById('studentListBody'); 
    const grade = document.getElementById('gradeFilter').value;
    const room = document.getElementById('roomFilter').value;
    const summarySection = document.getElementById('summarySection');

    // 🔥 เรียกดึงสถานะยืนยันความถูกต้องของห้องเรียนที่เลือกทันที
    await fetchClassroomConfirmation(grade, room);

    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">กำลังค้นหาข้อมูล...</td></tr>';
    summarySection.style.display = 'none';

    

    // ดึงข้อมูลทั้งหมดตามเงื่อนไขการกรอง
    let query = supabase
        .from('students')
        .select('*')
        .order('student_code', { ascending: true });

    if (grade) query = query.eq('grade_level', grade);
    if (room) query = query.eq('room_number', room);

    
    // 🔥 เปลี่ยนมาใช้ฟังก์ชันดึงข้อมูลแบบจัดชุด ทะลุขีดจำกัด 1,000 รายการ
    const data = await fetchAllStudentsFromDB(grade, room);
    //const { data, error } = await query;

    // if (error) {
    //     console.error("Error:", error);
    //     tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
    //     return;
    // }

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">ไม่พบข้อมูลนักเรียนที่ตรงกับเงื่อนไข</td></tr>';
        window.currentStudentsData = [];
        updatePaginationUI(0, 0, 0);
        return;
    }
    
    // เก็บข้อมูลลงความจำ และวาดการ์ดสรุปยอดรวม
    window.currentStudentsData = data; 
    renderSummaryCards(data);

    // 🔥 สั่งจัดเรียงตามเงื่อนไขที่เลือก (ค่าเริ่มต้น: เพศ ชาย -> หญิง -> รหัสน้อยไปมาก)
    applySortingAndRender();

    // รีเซ็ตไปที่หน้า 1 แล้วส่งหน้าที่ให้ renderStudentTablePage() วาดตารางตามจำนวนต่อหน้าเท่านั้น
    currentPage = 1;
    renderStudentTablePage();
});

// ==========================================
// 2. ระบบคำนวณและวาดตารางแบ่งหน้า (Pagination System)
// ==========================================

// เปลี่ยนจำนวนรายการต่อหน้าจาก Dropdown
window.handlePageSizeChange = (newSize) => {
    currentPage = 1;
    resetSelection();
    renderStudentTablePage();
};

// เปลี่ยนไปยังหน้าที่เลือก
window.changePage = (page) => {
    const totalData = window.currentStudentsData || [];
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    const currentSize = (pageSizeSelect && pageSizeSelect.value !== 'all') ? parseInt(pageSizeSelect.value) : 'all';
    const totalPages = currentSize === 'all' ? 1 : Math.ceil(totalData.length / currentSize);
    
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    resetSelection(); 
    renderStudentTablePage();
};



function renderStudentTablePage() {
    const tbody = document.getElementById('studentListBody');
    const data = window.currentStudentsData || [];
    const role = localStorage.getItem('userRole');

    const isExecutive = (role === 'executive');
    const isAdminOrRegistrar = (role === 'admin' || role === 'registrar');
    const baseCanEdit = !isExecutive && (window.isSystemOpen || isAdminOrRegistrar);

    const pageSizeSelect = document.getElementById('pageSizeSelect');
    let currentSize = 40;
    if (pageSizeSelect) {
        currentSize = pageSizeSelect.value === 'all' ? 'all' : (parseInt(pageSizeSelect.value) || 40);
    }

    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">ไม่พบข้อมูลนักเรียนที่ตรงกับเงื่อนไข</td></tr>';
        updatePaginationUI(0, 0, 0);
        return;
    }

    let startIndex = 0;
    let endIndex = data.length;

    if (currentSize !== 'all') {
        startIndex = (currentPage - 1) * currentSize;
        endIndex = Math.min(startIndex + currentSize, data.length);
    }

    const pageData = data.slice(startIndex, endIndex);

    pageData.forEach((student, index) => {
        const tr = document.createElement('tr');
        const itemNumber = startIndex + index + 1;
        
        // 🔥 แปลง Key ห้องเรียนให้ตรงกับ Map
        const gLevel = (student.grade_level || '').trim();
        const rNum = Number(student.room_number);
        const roomKey = `${gLevel}/${rNum}`;
        
        // ตรวจสอบว่าห้องนี้ยืนยันแล้วหรือยัง
        const isRoomConfirmed = window.confirmedRoomsMap ? !!window.confirmedRoomsMap[roomKey] : false;

        // 🔥 เงื่อนไขการล็อก: ถ้าห้องยืนยันแล้ว ครูประจำชั้นจะแก้ไขไม่ได้ (Admin/Registrar ยังแก้ไขได้)
        const canEditThisStudent = baseCanEdit && (!isRoomConfirmed || isAdminOrRegistrar);
        const canDeleteThisStudent = !isExecutive && isAdminOrRegistrar && (!isRoomConfirmed || isAdminOrRegistrar);

        // ไฮไลต์สีแถวหากไม่ใช่ "มีตัว"
        const st = (student.status || 'มีตัว').trim();
        const isNotActive = !(st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ');
        
        if (isNotActive) {
            tr.style.backgroundColor = '#fff1f2';
        }

        // ข้อความแจ้งเตือนสถานะล็อก
        const lockNotice = (isRoomConfirmed && !isAdminOrRegistrar)
            ? `<div style="font-size: 11px; color: #dc2626; font-weight: 600; margin-top: 2px;">🔒 ห้องนี้ยืนยันข้อมูลแล้ว</div>` 
            : '';

        tr.innerHTML = `
            <td class="admin-only-col" data-label="เลือก" style="text-align: center;">
                ${canDeleteThisStudent ? `<input type="checkbox" class="student-select-chk" value="${student.id}" onchange="updateSelectedCount()" style="cursor: pointer;">` : ''}
            </td>
            <td data-label="ลำดับ" style="text-align: center; font-weight: 600; color: #555;">${itemNumber}</td>
            <td data-label="รหัสนักเรียน"><b>${student.student_code}</b></td>
            <td data-label="ระดับชั้น/ห้อง">${student.grade_level}/${student.room_number}</td>
            <td data-label="ชื่อ-นามสกุล">${student.prefix}${student.first_name} ${student.last_name}</td>
            <td data-label="เพศ">${student.gender}</td>
            <td data-label="อัปเดตสถานะ">
                <select id="status-${student.id}" ${!canEditThisStudent ? 'disabled' : ''} style="padding: 5px; border-radius: 4px; border: 1px solid ${isNotActive ? '#fca5a5' : '#ccc'}; max-width: 170px; ${isNotActive ? 'background: #fff; color: #be123c; font-weight: 600;' : ''}">
                    <option value="มีตัว" ${st === 'มีตัว' ? 'selected' : ''}>มีตัว</option>
                    <option value="ขาดเรียนติดต่อกันเป็นเวลานาน" ${st.includes('ขาดเรียน') ? 'selected' : ''}>ขาดเรียนติดต่อกันเป็นเวลานาน</option>
                    <option value="ย้ายสถานศึกษา" ${st.includes('ย้าย') ? 'selected' : ''}>ย้ายสถานศึกษา</option>
                    <option value="พักการเรียน" ${st.includes('พัก') ? 'selected' : ''}>พักการเรียน</option>
                </select>
                ${canEditThisStudent ? `<button onclick="updateStudentStatus('${student.id}')" class="btn-save-status">บันทึก</button>` : ''}
                ${lockNotice}
                <br><span id="msg-${student.id}" style="font-size: 12px; margin-top: 3px; display: block;"></span>
            </td>
            <td data-label="จัดการ">
                ${canEditThisStudent 
                    ? `<button onclick="openEditModal('${student.id}')" class="btn-edit">✏️ แก้ไข</button>` 
                    : '<span style="color:#999; font-size:13px;">🔒 ล็อกการแก้ไข</span>'
                }
                ${canDeleteThisStudent ? `<button onclick="deleteSingleStudent('${student.id}', '${student.prefix}${student.first_name} ${student.last_name}')" style="padding: 6px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px; font-size: 13px;">🗑️ ลบ</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const adminCols = document.querySelectorAll('.admin-only-col');
    adminCols.forEach(el => {
        el.style.display = (role === 'admin' || role === 'registrar') ? (window.innerWidth <= 768 ? 'flex' : 'table-cell') : 'none';
    });

    updatePaginationUI(startIndex + 1, endIndex, data.length, currentSize);
}

// วาดปุ่มเปลี่ยนหน้าและข้อความแสดงจำนวนรายการ
function updatePaginationUI(from, to, total, currentSize) {
    const info = document.getElementById('paginationInfo');
    const controls = document.getElementById('paginationControls');

    if (!info || !controls) return;

    if (total === 0) {
        info.textContent = '';
        controls.innerHTML = '';
        return;
    }

    const totalPages = currentSize === 'all' ? 1 : Math.ceil(total / currentSize);
    info.innerHTML = `แสดง <b>${from} - ${to}</b> จากทั้งหมด <b>${total}</b> รายการ (หน้า <b>${currentPage} / ${totalPages}</b>)`;

    if (totalPages <= 1) {
        controls.innerHTML = '';
        return;
    }

    let buttonsHTML = `<button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">◀ ก่อนหน้า</button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            buttonsHTML += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === currentPage - 2 || i === currentPage + 2) {
            buttonsHTML += `<span style="padding: 0 3px; color: #aaa;">...</span>`;
        }
    }

    buttonsHTML += `<button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">ถัดไป ▶</button>`;

    controls.innerHTML = buttonsHTML;
}


// ฟังก์ชันสำหรับบันทึกสถานะนักเรียน (ผูกเข้ากับ window เพื่อให้ปุ่มใน HTML เรียกใช้ได้)


window.updateStudentStatus = async (studentId) => {
    const selectEl = document.getElementById(`status-${studentId}`);
    const msgEl = document.getElementById(`msg-${studentId}`);
    if (!selectEl) return;

    const role = localStorage.getItem('userRole');
    const isAdminOrRegistrar = (role === 'admin' || role === 'registrar');

    // 🔥 ดึงข้อมูลนักเรียนจาก Memory เพื่อตรวจสอบห้อง
    const student = (window.currentStudentsData || []).find(s => String(s.id) === String(studentId));
    if (student) {
        const gLevel = (student.grade_level || '').trim();
        const rNum = Number(student.room_number);
        const roomKey = `${gLevel}/${rNum}`;
        const isRoomConfirmed = window.confirmedRoomsMap ? !!window.confirmedRoomsMap[roomKey] : false;

        // ถ้าห้องยืนยันแล้ว และผู้ใช้ไม่ใช่ Admin/Registrar -> บล็อกการบันทึกทันที
        if (isRoomConfirmed && !isAdminOrRegistrar) {
            alert('🔒 ห้องเรียนนี้ยืนยันข้อมูลเรียบร้อยแล้ว ไม่สามารถแก้ไขได้');
            if (msgEl) {
                msgEl.style.color = '#dc2626';
                msgEl.textContent = '🔒 ห้องนี้ถูกล็อกแล้ว';
            }
            selectEl.value = student.status || 'มีตัว';
            return;
        }
    }

    const newStatus = selectEl.value;

    try {
        if (msgEl) {
            msgEl.style.color = '#2563eb';
            msgEl.textContent = '⏳ กำลังบันทึก...';
        }

        const { error } = await supabase
            .from('students')
            .update({ status: newStatus })
            .eq('id', studentId);

        if (error) throw error;

        // อัปเดตค่าใน memory
        if (student) {
            student.status = newStatus;
        }

        if (msgEl) {
            msgEl.style.color = '#16a34a';
            msgEl.textContent = '✅ บันทึกสำเร็จ';
            setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
        }
        
        renderStudentTablePage();

    } catch (err) {
        console.error('Error updating student status:', err);
        if (msgEl) {
            msgEl.style.color = '#dc2626';
            msgEl.textContent = '❌ บันทึกไม่สำเร็จ';
        }
    }
};
// ==========================================
// ส่วนที่ 1: ระบบนำเข้าข้อมูล (Import - Copy/Paste)
// ==========================================
document.getElementById('showImportBtn').addEventListener('click', () => {
    document.getElementById('importSection').style.display = 'block';
});

document.getElementById('cancelImportBtn').addEventListener('click', () => {
    document.getElementById('importSection').style.display = 'none';
    document.getElementById('importDataText').value = '';
    document.getElementById('importStatus').textContent = '';
});

document.getElementById('processImportBtn').addEventListener('click', async () => {
    const role = localStorage.getItem('userRole');
    
    // ป้องกันคนสวมสิทธิ์กดบันทึก
    if (role !== 'admin' && role !== 'registrar') {
        showToast('คุณไม่มีสิทธิ์ในการนำเข้าข้อมูลนักเรียน', 'error');
        return;
    }

    const rawData = document.getElementById('importDataText').value.trim();
    const statusDiv = document.getElementById('importStatus');
    
    if (!rawData) {
        statusDiv.textContent = '❌ กรุณาวางข้อมูลก่อนบันทึก';
        statusDiv.style.color = 'red';
        return;
    }

    statusDiv.textContent = '⏳ กำลังประมวลผลและบันทึกข้อมูล...';
    statusDiv.style.color = 'blue';

    // แยกบรรทัดและเตรียมข้อมูล
    const rows = rawData.split('\n');
    const insertData = [];

    for (let row of rows) {
        // ข้อมูลที่ก๊อปจาก Excel จะถูกคั่นด้วยปุ่ม Tab (\t)
        const cols = row.split('\t').map(c => c.trim());
        
        // เช็คว่ามีอย่างน้อย 7 คอลัมน์ (รหัส|คำนำหน้า|ชื่อ|นามสกุล|ชั้น|ห้อง|เพศ)
        if (cols.length >= 7 && cols[0] !== '') {
            insertData.push({
                student_code: cols[0],
                prefix: cols[1],
                first_name: cols[2],
                last_name: cols[3],
                grade_level: cols[4],
                room_number: cols[5],
                gender: cols[6],
                status: 'มีตัว' // ค่าเริ่มต้น
            });
        }
    }

    if (insertData.length === 0) {
        statusDiv.textContent = '❌ รูปแบบข้อมูลไม่ถูกต้อง หรือไม่มีข้อมูล';
        statusDiv.style.color = 'red';
        return;
    }

    // สั่งบันทึกแบบ Upsert (ถ้ารหัสซ้ำ ให้อัปเดตข้อมูลใหม่ทับ)
    const { error } = await supabase
        .from('students')
        .upsert(insertData, { onConflict: 'student_code' });

    if (error) {
        statusDiv.textContent = '❌ เกิดข้อผิดพลาด: ' + error.message;
        statusDiv.style.color = 'red';
        console.error(error);
    } else {
        statusDiv.textContent = `✅ นำเข้าสำเร็จ ${insertData.length} รายการ`;
        statusDiv.style.color = 'green';
        document.getElementById('importDataText').value = ''; 
        document.getElementById('searchBtn').click(); // โหลดรายชื่อใหม่ทันที
    }
});

// ==========================================
// ส่วนที่ 2: ระบบส่งออกเป็น Excel (Export)
// ==========================================
document.getElementById('exportExcelBtn').addEventListener('click', async () => {
    const grade = document.getElementById('gradeFilter').value;
    const room = document.getElementById('roomFilter').value;
    
    // ดึงข้อมูลตามเงื่อนไขที่กำลังค้นหา
    let query = supabase.from('students').select('*');
    if (grade) query = query.eq('grade_level', grade);
    if (room) query = query.eq('room_number', room);
    
    const { data, error } = await query.order('student_code', { ascending: true });
    
    if (error || !data || data.length === 0) {
        alert('ไม่พบข้อมูลสำหรับส่งออก');
        return;
    }

    // จัดรูปแบบข้อมูลสำหรับใส่ Excel
    const excelData = data.map(s => ({
        'รหัสนักเรียน': s.student_code,
        'คำนำหน้า': s.prefix,
        'ชื่อ': s.first_name,
        'นามสกุล': s.last_name,
        'ระดับชั้น': s.grade_level,
        'ห้อง': s.room_number,
        'เพศ': s.gender,
        'สถานะ': s.status
    }));

    // สร้างไฟล์ Excel และสั่งดาวน์โหลด
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "รายชื่อนักเรียน");
    
    const fileName = `รายชื่อนักเรียน_${grade || 'ทั้งหมด'}${room ? '_ห้อง'+room : ''}.xlsx`;
    XLSX.writeFile(workbook, fileName);
});


// ==========================================
// ส่วนระบบแก้ไขข้อมูลนักเรียนรายบุคคล (Edit Modal)
// ==========================================

// 1. เปิดป๊อปอัปพร้อมดึงข้อมูลเดิมมาแสดง
window.openEditModal = (studentId) => {
    // หาข้อมูลนักเรียนจาก Array ที่เราดึงมาตอนค้นหา
    const student = window.currentStudentsData.find(s => s.id === studentId);
    if (!student) return;

    // เติมข้อมูลลงในฟอร์ม
    document.getElementById('edit-id').value = student.id;
    document.getElementById('edit-code').value = student.student_code;
    document.getElementById('edit-prefix').value = student.prefix;
    document.getElementById('edit-fname').value = student.first_name;
    document.getElementById('edit-lname').value = student.last_name;
    document.getElementById('edit-grade').value = student.grade_level;
    document.getElementById('edit-room').value = student.room_number;
    document.getElementById('edit-gender').value = student.gender;
    
    document.getElementById('editError').style.display = 'none'; // ซ่อนข้อความแจ้งเตือน

    // แสดงป๊อปอัป (ตั้งค่าให้เป็น flex เพื่อให้อยู่ตรงกลาง)
    document.getElementById('editModal').style.display = 'flex'; 
};

// 2. ปิดป๊อปอัป
window.closeEditModal = () => {
    document.getElementById('editModal').style.display = 'none';
};

// 3. บันทึกข้อมูลการแก้ไข
window.saveEditStudent = async () => {
    const id = document.getElementById('edit-id').value;
    const errorMsg = document.getElementById('editError');
    
    const updateData = {
        student_code: document.getElementById('edit-code').value.trim(),
        prefix: document.getElementById('edit-prefix').value.trim(),
        first_name: document.getElementById('edit-fname').value.trim(),
        last_name: document.getElementById('edit-lname').value.trim(),
        grade_level: document.getElementById('edit-grade').value.trim(),
        room_number: document.getElementById('edit-room').value.trim(),
        gender: document.getElementById('edit-gender').value
    };

    if (!updateData.first_name || !updateData.student_code) {
        errorMsg.textContent = 'กรุณากรอกรหัสนักเรียนและชื่อให้ครบถ้วน';
        errorMsg.style.display = 'block';
        return;
    }

    const { error } = await supabase
        .from('students')
        .update(updateData)
        .eq('id', id);

    if (error) {
        errorMsg.textContent = 'บันทึกไม่สำเร็จ: ' + error.message;
        errorMsg.style.display = 'block';
        showToast('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error'); // แสดง Toast สีแดงเมื่อพลาด
    } else {
        closeEditModal();
        document.getElementById('searchBtn').click(); 
        
        // เปลี่ยนจาก alert() เป็น showToast() สีเขียวสวยงาม
        showToast('อัปเดตข้อมูลนักเรียนเรียบร้อยแล้ว!', 'success');
    }
};

// ฟังก์ชันสำหรับคำนวณและวาดการ์ดสรุปยอด
function renderSummaryCards(data) {
    const summarySection = document.getElementById('summarySection');
    if (!data || data.length === 0) {
        summarySection.style.display = 'none';
        return;
    }
let suspendCount = 0;
    const total = data.length;
    const maleCount = data.filter(s => s.gender === 'ชาย').length;
    const femaleCount = data.filter(s => s.gender === 'หญิง').length;
    //const presentCount = data.filter(s => s.status === 'มีตัว').length;
    const presentCount = data.filter(s => {
        const st = (s.status || 'มีตัว').trim();
        if (st.includes('พักการเรียน')) suspendCount++;
        return st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ' || st.includes('พักการเรียน');
    }).length;
    const otherCount = total - presentCount;

    summarySection.style.display = 'block';
    summarySection.innerHTML = `
        <div class="summary-container">
            <div class="stat-card total">
                <div class="stat-label">👥 นักเรียนทั้งหมด</div>
                <div class="stat-value">${total} <span style="font-size: 12px; font-weight: normal;">คน</span></div>
            </div>
            <div class="stat-card male">
                <div class="stat-label">👨 ชาย</div>
                <div class="stat-value">${maleCount} <span style="font-size: 12px; font-weight: normal;">คน</span></div>
            </div>
            <div class="stat-card female">
                <div class="stat-label">👩 หญิง</div>
                <div class="stat-value">${femaleCount} <span style="font-size: 12px; font-weight: normal;">คน</span></div>
            </div>
            <div class="stat-card present">
                <div class="stat-label">✅ มีตัว</div>
                <div class="stat-value">${presentCount} <span style="font-size: 12px; font-weight: normal;">คน</span></div>
            </div>
            <div class="stat-card other">
                <div class="stat-label">⚠️ สถานะอื่นๆ</div>
                <div class="stat-value">${otherCount} <span style="font-size: 12px; font-weight: normal;">คน</span></div>
            </div>
        </div>
    `;
}

// ==========================================
// ระบบเลือก และ ลบข้อมูลนักเรียน (Single & Bulk Delete)
// ==========================================

// 1. ฟังก์ชันเลือกทั้งหมด / ยกเลิกทั้งหมด
window.toggleSelectAll = (master) => {
    const checkboxes = document.querySelectorAll('.student-select-chk');
    checkboxes.forEach(chk => chk.checked = master.checked);
    updateSelectedCount();
};

// 2. ฟังก์ชันนับจำนวนที่เลือก และควบคุมการแสดงปุ่มลบหลายรายการ
window.updateSelectedCount = () => {
    const selected = document.querySelectorAll('.student-select-chk:checked');
    const countSpan = document.getElementById('selectedCount');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    
    if (countSpan && deleteBtn) {
        countSpan.textContent = selected.length;
        deleteBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
    }
};

// 3. ฟังก์ชันลบนักเรียนครั้งละ 1 คน
window.deleteSingleStudent = async (studentId, studentName) => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin' && role !== 'registrar') {
        showToast('คุณไม่มีสิทธิ์ลบข้อมูลนักเรียน', 'error');
        return;
    }

    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ "${studentName}" ?\n\n⚠️ การลบนี้ไม่สามารถยกเลิกได้`)) {
        return;
    }

    const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', studentId);

    if (error) {
        showToast('เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message, 'error');
    } else {
        showToast(`ลบข้อมูล "${studentName}" เรียบร้อยแล้ว`, 'success');
        document.getElementById('searchBtn').click(); // โหลดตารางใหม่
    }
};

// 4. ฟังก์ชันลบนักเรียนหลายคนพร้อมกัน (Bulk Delete)
document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin' && role !== 'registrar') {
        showToast('คุณไม่มีสิทธิ์ลบข้อมูลนักเรียน', 'error');
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.student-select-chk:checked');
    const selectedIds = Array.from(selectedCheckboxes).map(chk => chk.value);

    if (selectedIds.length === 0) {
        showToast('กรุณาเลือกนักเรียนที่ต้องการลบอย่างน้อย 1 คน', 'error');
        return;
    }

    if (!confirm(`⚠️ ยืนยันการลบนักเรียนที่เลือกทั้งหมด ${selectedIds.length} รายการ?\n\nการดำเนินการนี้จะลบข้อมูลออกจากฐานข้อมูลถาวร`)) {
        return;
    }

    const { error } = await supabase
        .from('students')
        .delete()
        .in('id', selectedIds);

    if (error) {
        showToast('เกิดข้อผิดพลาดในการลบข้อมูล: ' + error.message, 'error');
    } else {
        showToast(`ลบข้อมูลนักเรียนสำเร็จ ${selectedIds.length} รายการ`, 'success');
        
        // รีเซ็ตหัวตารางเลือกทั้งหมด
        // const selectAll = document.getElementById('selectAllCheckbox');
        // if (selectAll) selectAll.checked = false;
        
        // updateSelectedCount();
        resetSelection(); // <--- เรียกใช้ฟังก์ชันรีเซ็ตปุ่มและตัวเลข
        document.getElementById('searchBtn').click(); // โหลดตารางใหม่
    }
});

// ฟังก์ชันสำหรับล้างค่าการเลือกและซ่อนปุ่มลบรายการที่เลือก
window.resetSelection = () => {
    const selectAll = document.getElementById('selectAllCheckbox');
    if (selectAll) selectAll.checked = false;
    
    const countSpan = document.getElementById('selectedCount');
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    
    if (countSpan) countSpan.textContent = '0';
    if (deleteBtn) deleteBtn.style.display = 'none';
};

// ==========================================
// ระบบเพิ่มข้อมูลนักเรียนรายบุคคล (Add Student Modal)
// ==========================================

// 1. เปิด Modal เพิ่มข้อมูลนักเรียน
window.openAddModal = () => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin' && role !== 'registrar') {
        showToast('คุณไม่มีสิทธิ์เพิ่มข้อมูลนักเรียน', 'error');
        return;
    }

    // ล้างข้อมูลเก่าในฟอร์ม
    document.getElementById('add-code').value = '';
    document.getElementById('add-prefix').value = 'ด.ช.';
    document.getElementById('add-fname').value = '';
    document.getElementById('add-lname').value = '';
    document.getElementById('add-grade').value = document.getElementById('gradeFilter').value || 'ม.1';
    document.getElementById('add-room').value = document.getElementById('roomFilter').value || '1';
    document.getElementById('add-gender').value = 'ชาย';
    document.getElementById('addError').style.display = 'none';

    document.getElementById('addModal').style.display = 'flex';
};

// 2. ปิด Modal เพิ่มข้อมูล
window.closeAddModal = () => {
    document.getElementById('addModal').style.display = 'none';
};

// 3. บันทึกข้อมูลนักเรียนใหม่
window.saveAddStudent = async () => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin' && role !== 'registrar') {
        showToast('คุณไม่มีสิทธิ์เพิ่มข้อมูลนักเรียน', 'error');
        return;
    }

    const errorMsg = document.getElementById('addError');
    
    const newStudent = {
        student_code: document.getElementById('add-code').value.trim(),
        prefix: document.getElementById('add-prefix').value.trim(),
        first_name: document.getElementById('add-fname').value.trim(),
        last_name: document.getElementById('add-lname').value.trim(),
        grade_level: document.getElementById('add-grade').value.trim(),
        room_number: document.getElementById('add-room').value.trim(),
        gender: document.getElementById('add-gender').value,
        status: 'มีตัว' // ค่าเริ่มต้น
    };

    if (!newStudent.student_code || !newStudent.first_name || !newStudent.last_name || !newStudent.room_number) {
        errorMsg.textContent = 'กรุณากรอกรหัส, ชื่อ, นามสกุล และห้อง ให้ครบถ้วน';
        errorMsg.style.display = 'block';
        return;
    }

    const { data, error } = await supabase
        .from('students')
        .insert([newStudent])
        .select();

    if (error) {
        errorMsg.textContent = 'บันทึกไม่สำเร็จ (รหัสนักเรียนอาจซ้ำกับคนอื่น): ' + error.message;
        errorMsg.style.display = 'block';
        showToast('เกิดข้อผิดพลาดในการเพิ่มข้อมูล', 'error');
    } else {
        closeAddModal();
        showToast(`เพิ่มนักเรียน "${newStudent.prefix}${newStudent.first_name} ${newStudent.last_name}" เรียบร้อยแล้ว`, 'success');
        
        // ปรับตัวกรองให้ตรงกับระดับชั้นและห้องของนักเรียนใหม่ แล้วสั่งค้นหาทันที
        document.getElementById('gradeFilter').value = newStudent.grade_level;
        document.getElementById('roomFilter').value = newStudent.room_number;
        document.getElementById('searchBtn').click();
    }
};

// ตัวแปร Global เก็บสถานะระบบส่วนกลาง
window.isSystemOpen = true;

// ==========================================
// 1. ระบบดึงและสลับสถานะเปิด/ปิดระบบส่วนกลาง (System Control)
// ==========================================

// ดึงสถานะระบบจาก Supabase
// ดึงสถานะระบบจาก Supabase (ป้องกันคำว่า "กำลังโหลด..." ค้าง)
async function checkSystemStatus() {
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('is_open')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error("Error fetching system settings:", error);
        }

        // หากมีข้อมูลให้ใช้ค่านั้น ถ้าไม่มี หรือเกิด Error ให้ตั้งค่าเริ่มต้นเป็นเปิดระบบ (true)
        if (data && typeof data.is_open === 'boolean') {
            window.isSystemOpen = data.is_open;
        } else {
            window.isSystemOpen = true; 
        }
    } catch (err) {
        console.error("Fetch system status exception:", err);
        window.isSystemOpen = true;
    }

    // อัปเดตข้อความและสีปุ่มทันที
    updateSystemControlUI();
}

// อัปเดตหน้าตา UI สวิตช์ Admin และแถบแจ้งเตือน
function updateSystemControlUI() {
    const role = localStorage.getItem('userRole');
    const toggleBtn = document.getElementById('systemToggleBtn');
    const banner = document.getElementById('systemClosedBanner');

    if (toggleBtn) {
        if (window.isSystemOpen) {
            toggleBtn.textContent = '🟢 เปิดใช้งาน';
            toggleBtn.style.backgroundColor = '#28a745';
            toggleBtn.style.color = 'white';
        } else {
            toggleBtn.textContent = '🔴 ปิดระบบ';
            toggleBtn.style.backgroundColor = '#dc3545';
            toggleBtn.style.color = 'white';
        }
    }

    // แสดงป้ายแจ้งเตือนเมื่อระบบปิดอยู่ และไม่ใช่ Admin
    if (banner) {
        banner.style.display = (!window.isSystemOpen && role !== 'admin') ? 'block' : 'none';
    }
}

// Admin กดสลับสถานะระบบ
window.toggleSystemState = async () => {
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') return;

    const newState = !window.isSystemOpen;
    const actionText = newState ? 'เปิดระบบ' : 'ปิดระบบ (ห้ามแก้ไขข้อมูล)';
    
    if (!confirm(`คุณต้องการ ${actionText} ใช่หรือไม่?`)) return;

    const { error } = await supabase
        .from('system_settings')
        .update({ is_open: newState, updated_at: new Date() })
        .eq('id', 1);

    if (error) {
        showToast('ไม่สามารถเปลี่ยนสถานะระบบได้: ' + error.message, 'error');
    } else {
        window.isSystemOpen = newState;
        updateSystemControlUI();
        showToast(`ทำการ${actionText}เรียบร้อยแล้ว`, 'success');
        
        // สั่งโหลดตารางและล็อกปุ่มต่างๆ ใหม่ทันที
        document.getElementById('searchBtn').click();
    }
};

// ==========================================
// 2. ระบบการยืนยันข้อมูลประจำห้องเรียน (Classroom Confirmation)
// ==========================================

// ==========================================
// ระบบการยืนยันข้อมูลประจำห้องเรียน (Classroom Confirmation)
// ==========================================

// ดึงสถานะการยืนยันของห้องเรียนปัจจุบัน
async function fetchClassroomConfirmation(grade, room) {
    const confirmCard = document.getElementById('confirmCard');
    const confirmToggle = document.getElementById('classroomConfirmToggle');
    const confirmBadge = document.getElementById('confirmBadge');
    const role = localStorage.getItem('userRole');

    // ถ้าไม่ได้เลือกทั้งชั้นและห้อง (เช่น เลือก "ทุกชั้น/ทุกห้อง") ให้ซ่อนกล่องยืนยัน
    if (!grade || !room) {
        if (confirmCard) confirmCard.style.display = 'none';
        return;
    }

    if (confirmCard) confirmCard.style.display = 'flex';

    // ดึงสถานะจากตาราง classroom_teachers ให้ตรงกับแดชบอร์ด
    const { data, error } = await supabase
        .from('classroom_teachers')
        .select('is_confirmed')
        .eq('grade_level', grade)
        .eq('room_number', room)
        .maybeSingle();

    if (error) {
        console.error("Error fetching confirmation status:", error);
    }

    const isConfirmed = data ? (data.is_confirmed === true) : false;
    if (confirmToggle) confirmToggle.checked = isConfirmed;

    if (confirmBadge) {
        if (isConfirmed) {
            confirmBadge.textContent = '✅ ยืนยันข้อมูลแล้ว';
            confirmBadge.style.color = '#2e7d32';
        } else {
            confirmBadge.textContent = '⏳ ยังไม่ยืนยันข้อมูล';
            confirmBadge.style.color = '#c62828';
        }
    }

    // 🔥 ล็อกสวิตช์ยืนยันข้อมูลสำหรับ ผู้บริหาร (ให้ดูได้อย่างเดียว) และล็อกเมื่อระบบปิด
    if (role === 'executive' || (!window.isSystemOpen && role !== 'admin')) {
        if (confirmToggle) confirmToggle.disabled = true;
    } else {
        if (confirmToggle) confirmToggle.disabled = false;
    }

    // กฎการล็อกสวิตช์ยืนยันข้อมูลเมื่อระบบปิดอยู่
    if (!window.isSystemOpen && role !== 'admin') {
        if (confirmToggle) confirmToggle.disabled = true;
    } else {
        if (confirmToggle) confirmToggle.disabled = false;
    }
}

// เมื่อเปิด/ปิด สวิตช์ยืนยันข้อมูล
window.handleClassroomConfirmChange = async (checkbox) => {
    const role = localStorage.getItem('userRole');

    if (role === 'executive') {
        showToast('ผู้บริหารมีสิทธิ์ดูข้อมูลได้อย่างเดียวเท่านั้น', 'error');
        checkbox.checked = !checkbox.checked;
        return;
    }
    
    if (!window.isSystemOpen && role !== 'admin') {
        showToast('ระบบปิดอยู่ ไม่สามารถเปลี่ยนสถานะการยืนยันได้', 'error');
        checkbox.checked = !checkbox.checked;
        return;
    }

    const grade = document.getElementById('gradeFilter').value;
    const room = document.getElementById('roomFilter').value;

    if (!grade || !room) {
        showToast('กรุณาเลือกระดับชั้นและห้องเรียนก่อนทำการยืนยัน', 'error');
        checkbox.checked = !checkbox.checked;
        return;
    }

    const isConfirmed = checkbox.checked;

    // อัปเดตลงตาราง classroom_teachers
    const { error } = await supabase
        .from('classroom_teachers')
        .update({ 
            is_confirmed: isConfirmed,
            confirmed_at: isConfirmed ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        })
        .eq('grade_level', grade)
        .eq('room_number', room);

    if (error) {
        showToast('บันทึกการยืนยันไม่สำเร็จ: ' + error.message, 'error');
        checkbox.checked = !isConfirmed;
    } else {
        showToast(isConfirmed ? 'ยืนยันข้อมูลห้องเรียนเรียบร้อยแล้ว' : 'ยกเลิกการยืนยันข้อมูลเรียบร้อย', 'info');
        // 🔥 เพิ่ม 2 บรรทัดนี้ลงไปตรงนี้ครับ
        await window.loadConfirmedRoomsMap(); // อัปเดต Map สถานะใหม่
        renderStudentTablePage();             // รีเฟรชตารางนักเรียนเพื่อสั่ง ล็อก/ปลดล็อก ปุ่มทันที
        
        await fetchClassroomConfirmation(grade, room);
    }
};

// ==========================================
// ระบบคำนวณและวาดตารางแบ่งหน้า (Pagination System)
// ==========================================

// 1. เปลี่ยนจำนวนรายการต่อหน้า
window.handlePageSizeChange = (newSize) => {
    pageSize = newSize === 'all' ? 'all' : parseInt(newSize);
    currentPage = 1;
    resetSelection();
    renderStudentTablePage();
};

// 2. เปลี่ยนไปยังหน้าที่ต้องการ
window.changePage = (page) => {
    const totalData = window.currentStudentsData || [];
    const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalData.length / pageSize);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    resetSelection(); // ล้างการเลือก Checkbox เมื่อเปลี่ยนหน้า
    renderStudentTablePage();
};

// ==========================================
// ระบบจัดการบุคลากร (Staff Management)
// ==========================================

// สลับแท็บในหน้าบุคลากร
window.switchStaffTab = (tab) => {
    const btnTeachers = document.getElementById('tabClassroomTeachers');
    const btnOther = document.getElementById('tabOtherStaff');
    const secTeachers = document.getElementById('sectionClassroomTeachers');
    const secOther = document.getElementById('sectionOtherStaff');

    if (tab === 'teachers') {
        btnTeachers.style.color = 'var(--primary-purple)';
        btnTeachers.style.borderBottom = '3px solid var(--primary-purple)';
        btnOther.style.color = '#666';
        btnOther.style.borderBottom = 'none';
        secTeachers.style.display = 'block';
        secOther.style.display = 'none';
        loadClassroomTeachers();
    } else {
        btnOther.style.color = 'var(--primary-purple)';
        btnOther.style.borderBottom = '3px solid var(--primary-purple)';
        btnTeachers.style.color = '#666';
        btnTeachers.style.borderBottom = 'none';
        secOther.style.display = 'block';
        secTeachers.style.display = 'none';
        loadOtherStaff();
    }
};

// 1. โหลดข้อมูลตารางครูประจำชั้น
// async function loadClassroomTeachers() {
//     const tbody = document.getElementById('classroomTeacherListBody');
//     tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">กำลังโหลดข้อมูล...</td></tr>';

//     const role = localStorage.getItem('userRole');
//     const isAdmin = (role === 'admin' || role === 'registrar');

//     // ดึงข้อมูลห้องเรียนเรียงตาม ชั้น/ห้อง
//     const { data, error } = await supabase
//         .from('classroom_teachers')
//         .select('*')
//         .order('grade_level', { ascending: true })
//         .order('room_number', { ascending: true });

//     if (error) {
//         tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
//         return;
//     }

//     tbody.innerHTML = '';
    
//     data.forEach(item => {
//         const teachers = item.teacher_names || [];
//         // สร้าง Badge แสดงชื่อครูทุกคนในห้องนั้น
//         const teacherBadges = teachers.map(t => `<span style="display: inline-block; background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 15px; font-size: 13px; font-weight: 500; margin: 2px;">👤 ${t}</span>`).join(' ');

//         const tr = document.createElement('tr');
//         tr.innerHTML = `
//             <td style="text-align: center; font-weight: bold;">${item.grade_level}/${item.room_number}</td>
//             <td style="font-family: monospace; color: #555;">${item.email || '-'}</td>
//             <td>${teacherBadges || '<span style="color: #aaa; font-style: italic;">ยังไม่ได้ระบุรายชื่อครู</span>'}</td>
//             <td class="admin-only" style="text-align: center;">
//                 ${isAdmin ? `<button onclick="openEditTeacherModal('${item.id}', '${item.grade_level}', '${item.room_number}', '${item.email}', ${JSON.stringify(teachers).replace(/"/g, '&quot;')})" style="padding: 5px 10px; background: var(--primary-purple); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">✏️ แก้ไข</button>` : ''}
//             </td>
//         `;
//         tbody.appendChild(tr);
//     });
// }

// 2. เปิด Modal แก้ไขข้อมูลครูประจำชั้น
window.openEditTeacherModal = (id, grade, room, email, teachersArr) => {
    document.getElementById('modalTeacherTitle').textContent = `✏️ จัดการครูประจำชั้น (${grade}/${room})`;
    document.getElementById('editTeacherRoomId').value = id;
    document.getElementById('editTeacherEmail').value = email || '';

    const container = document.getElementById('teacherInputsContainer');
    container.innerHTML = '';

    // หากมีรายชื่อครูเดิม ให้สร้างช่องกรอกตามจำนวนคน ถ้าไม่มี ให้สร้าง 1 ช่องเปล่า
    if (teachersArr && teachersArr.length > 0) {
        teachersArr.forEach(name => addTeacherInputField(name));
    } else {
        addTeacherInputField('');
    }

    document.getElementById('editTeacherModal').style.display = 'flex';
};

// เพิ่มช่องกรอกชื่อครูแบบไดนามิก (ลบออกได้)
window.addTeacherInputField = (val = '') => {
    const container = document.getElementById('teacherInputsContainer');
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.innerHTML = `
        <input type="text" class="teacher-name-input" value="${val}" placeholder="คำนำหน้า ชื่อ-นามสกุล" style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
        <button type="button" onclick="this.parentElement.remove()" style="padding: 6px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">❌</button>
    `;
    container.appendChild(div);
};

window.closeEditTeacherModal = () => {
    document.getElementById('editTeacherModal').style.display = 'none';
};

// 3. บันทึกข้อมูลครูประจำชั้น
window.saveClassroomTeacher = async () => {
    const id = document.getElementById('editTeacherRoomId').value;
    const email = document.getElementById('editTeacherEmail').value.trim();
    
    // ดึงค่าชื่อครูจากทุกช่อง input ที่สร้างขึ้น
    const nameInputs = document.querySelectorAll('.teacher-name-input');
    const teacherNames = Array.from(nameInputs)
        .map(input => input.value.trim())
        .filter(name => name !== ''); // ตัดค่าว่างออก

    const { error } = await supabase
        .from('classroom_teachers')
        .update({
            email: email,
            teacher_names: teacherNames,
            updated_at: new Date()
        })
        .eq('id', id);

    if (error) {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        closeEditTeacherModal();
        showToast('อัปเดตรายชื่อครูประจำชั้นเรียบร้อยแล้ว', 'success');
        loadClassroomTeachers();
    }
};

// ==========================================
// ระบบจัดการบุคลากร (Staff Management System)
// ==========================================

let currentStaffTab = 'teachers';

// สลับแท็บและโหลดข้อมูล
// 1. ปรับสลับแท็บ และควบคุมปุ่มแสดงผล
window.switchStaffTab = (tab) => {
    currentStaffTab = tab;
    const btnTeachers = document.getElementById('tabClassroomTeachers');
    const btnOther = document.getElementById('tabOtherStaff');
    const secTeachers = document.getElementById('sectionClassroomTeachers');
    const secOther = document.getElementById('sectionOtherStaff');
    const addRoomBtn = document.getElementById('addRoomBtn');
    const addStaffBtn = document.getElementById('addStaffBtn');
    
    const role = localStorage.getItem('userRole');
    const isAdmin = (role === 'admin' || role === 'registrar');

    if (tab === 'teachers') {
        btnTeachers.style.color = 'var(--primary-purple)';
        btnTeachers.style.borderBottom = '3px solid var(--primary-purple)';
        btnOther.style.color = '#666';
        btnOther.style.borderBottom = 'none';
        secTeachers.style.display = 'block';
        secOther.style.display = 'none';
        
        // สลับปุ่มการทำงาน
        if (addRoomBtn) addRoomBtn.style.display = isAdmin ? 'inline-block' : 'none';
        if (addStaffBtn) addStaffBtn.style.display = 'none';
        loadClassroomTeachers();
    } else {
        btnOther.style.color = 'var(--primary-purple)';
        btnOther.style.borderBottom = '3px solid var(--primary-purple)';
        btnTeachers.style.color = '#666';
        btnTeachers.style.borderBottom = 'none';
        secOther.style.display = 'block';
        secTeachers.style.display = 'none';
        
        // สลับปุ่มการทำงาน
        if (addRoomBtn) addRoomBtn.style.display = 'none';
        if (addStaffBtn) addStaffBtn.style.display = isAdmin ? 'inline-block' : 'none';
        loadOtherStaff();
    }
};

// ==========================================
// ระบบเพิ่มห้องเรียนใหม่ (Add New Classroom)
// ==========================================
window.openAddRoomModal = () => {
    document.getElementById('new-room-number').value = '';
    document.getElementById('new-room-email').value = '';
    document.getElementById('new-room-password').value = '';
    document.getElementById('addRoomError').style.display = 'none';
    document.getElementById('addRoomModal').style.display = 'flex';
};

window.closeAddRoomModal = () => {
    document.getElementById('addRoomModal').style.display = 'none';
};

window.saveNewClassroom = async () => {
    const grade = document.getElementById('new-room-grade').value;
    const room = document.getElementById('new-room-number').value.trim();
    const email = document.getElementById('new-room-email').value.trim();
    const password = document.getElementById('new-room-password').value.trim();
    const errorMsg = document.getElementById('addRoomError');

    if (!room || !email || !password) {
        errorMsg.textContent = 'กรุณากรอกห้อง, อีเมล และรหัสผ่าน ให้ครบถ้วน';
        errorMsg.style.display = 'block';
        return;
    }

    if (password.length < 6) {
        errorMsg.textContent = 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
        errorMsg.style.display = 'block';
        return;
    }

    // 1. สร้างบัญชีเข้าใช้งานในระบบ Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { role: 'teacher', grade: grade, room: room }
        }
    });

    if (authError) {
        errorMsg.textContent = 'สร้างบัญชีไม่สำเร็จ: ' + authError.message;
        errorMsg.style.display = 'block';
        return;
    }

    // 2. บันทึกข้อมูลลงตาราง classroom_teachers
    const { error: dbError } = await supabase
        .from('classroom_teachers')
        .insert([{ grade_level: grade, room_number: room, email: email, teacher_names: [] }]);

    if (dbError) {
        errorMsg.textContent = 'บันทึกห้องเรียนไม่สำเร็จ: ' + dbError.message;
        errorMsg.style.display = 'block';
    } else {
        closeAddRoomModal();
        showToast(`เพิ่มห้องเรียน ${grade}/${room} และสร้างบัญชีเข้าใช้งานสำเร็จ`, 'success');
        loadClassroomTeachers();
    }
};

// ==========================================
// ระบบเพิ่มผู้บริหาร / ทะเบียน (พร้อมสร้างบัญชี Auth)
// ==========================================
window.openAddStaffModal = () => {
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-email').value = '';
    document.getElementById('staff-password').value = '';
    document.getElementById('staff-phone').value = '';
    document.getElementById('staffError').style.display = 'none';
    document.getElementById('addStaffModal').style.display = 'flex';
};

window.closeAddStaffModal = () => {
    document.getElementById('addStaffModal').style.display = 'none';
};

window.saveStaffMember = async () => {
    const name = document.getElementById('staff-name').value.trim();
    const role = document.getElementById('staff-role').value;
    const email = document.getElementById('staff-email').value.trim();
    const password = document.getElementById('staff-password').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const errorMsg = document.getElementById('staffError');

    if (!name || !email || !password) {
        errorMsg.textContent = 'กรุณากรอกชื่อ-นามสกุล, อีเมล และรหัสผ่านให้ครบถ้วน';
        errorMsg.style.display = 'block';
        return;
    }

    if (password.length < 6) {
        errorMsg.textContent = 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร';
        errorMsg.style.display = 'block';
        return;
    }

    errorMsg.style.display = 'none';

    // 1. สร้างบัญชีเข้าใช้งาน Auth ก่อน
    const { data: authData, error: authError } = await tempAuthClient.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { role: role, name: name }
        }
    });

    // หากสร้าง Auth ไม่สำเร็จ ให้หยุดทำงานทันที ไม่บันทึกลงตาราง DB
    if (authError) {
        errorMsg.textContent = 'สร้างบัญชีเข้าระบบไม่สำเร็จ: ' + authError.message;
        errorMsg.style.display = 'block';
        return;
    }

    // 2. เมื่อ Auth ผ่านแล้ว จึงบันทึกลงตาราง staff_members
    const { error: dbError } = await supabase
        .from('staff_members')
        .insert([{ name, role, email, phone }]);

    if (dbError) {
        errorMsg.textContent = 'บันทึกข้อมูลบุคลากรไม่สำเร็จ: ' + dbError.message;
        errorMsg.style.display = 'block';
    } else {
        closeAddStaffModal();
        showToast(`เพิ่ม ${role === 'executive' ? 'ผู้บริหาร' : 'เจ้าหน้าที่ทะเบียน'} "${name}" เรียบร้อยแล้ว`, 'success');
        loadOtherStaff();
    }
};

// 1. โหลดข้อมูลตารางครูประจำชั้น
async function loadClassroomTeachers() {
    const tbody = document.getElementById('classroomTeacherListBody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">กำลังโหลดข้อมูล...</td></tr>';

    const role = localStorage.getItem('userRole');
    const isAdmin = (role === 'admin' || role === 'registrar');

    const { data, error } = await supabase
        .from('classroom_teachers')
        .select('*')
        .order('grade_level', { ascending: true })
        .order('room_number', { ascending: true });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: red;">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    
    data.forEach(item => {
        const teachers = item.teacher_names || [];
        const teacherBadges = teachers.map(t => `<span style="display: inline-block; background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 15px; font-size: 13px; font-weight: 500; margin: 2px;">👤 ${t}</span>`).join(' ');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align: center; font-weight: bold;">${item.grade_level}/${item.room_number}</td>
            <td style="font-family: monospace; color: #555;">${item.email || '<span style="color:#ccc;">ยังไม่ได้ตั้งค่า</span>'}</td>
            <td>${teacherBadges || '<span style="color: #aaa; font-style: italic;">ยังไม่ได้ระบุรายชื่อครู</span>'}</td>
            <td class="admin-only-col" style="text-align: center;">
                ${isAdmin ? `<button onclick="openEditTeacherModal('${item.id}', '${item.grade_level}', '${item.room_number}', '${item.email || ''}', ${JSON.stringify(teachers).replace(/"/g, '&quot;')})" style="padding: 5px 10px; background: var(--primary-purple); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">✏️ แก้ไข</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const adminCols = document.querySelectorAll('.admin-only-col');
    adminCols.forEach(el => el.style.display = isAdmin ? 'table-cell' : 'none');
}

// 2. โหลดข้อมูลผู้บริหาร & ทะเบียน
async function loadOtherStaff() {
    const tbody = document.getElementById('otherStaffListBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">กำลังโหลดข้อมูล...</td></tr>';

    const role = localStorage.getItem('userRole');
    const isAdmin = (role === 'admin' || role === 'registrar');

    const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">เกิดข้อผิดพลาด: ${error.message}</td></tr>`;
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">ยังไม่มีข้อมูลผู้บริหาร หรือ เจ้าหน้าที่ทะเบียน</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    
    data.forEach(item => {
        const roleLabel = item.role === 'executive' ? '👔 ผู้บริหาร' : '📋 เจ้าหน้าที่ทะเบียน';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${roleLabel}</b></td>
            <td>${item.name}</td>
            <td style="font-family: monospace;">${item.email}</td>
            <td>${item.phone || '-'}</td>
            <td class="admin-only-col" style="text-align: center;">
                ${isAdmin ? `<button onclick="deleteStaffMember('${item.id}', '${item.name}')" style="padding: 5px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">🗑️ ลบ</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    const adminCols = document.querySelectorAll('.admin-only-col');
    adminCols.forEach(el => el.style.display = isAdmin ? 'table-cell' : 'none');
}

// Open/Close Teacher Modal
window.openEditTeacherModal = (id, grade, room, email, teachersArr) => {
    document.getElementById('modalTeacherTitle').textContent = `✏️ จัดการครูประจำชั้น (${grade}/${room})`;
    document.getElementById('editTeacherRoomId').value = id;
    document.getElementById('editTeacherEmail').value = email || '';

    const container = document.getElementById('teacherInputsContainer');
    container.innerHTML = '';

    if (teachersArr && teachersArr.length > 0) {
        teachersArr.forEach(name => addTeacherInputField(name));
    } else {
        addTeacherInputField('');
    }

    document.getElementById('editTeacherModal').style.display = 'flex';
};

window.addTeacherInputField = (val = '') => {
    const container = document.getElementById('teacherInputsContainer');
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.innerHTML = `
        <input type="text" class="teacher-name-input" value="${val}" placeholder="คำนำหน้า ชื่อ-นามสกุล" style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
        <button type="button" onclick="this.parentElement.remove()" style="padding: 6px 10px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">❌</button>
    `;
    container.appendChild(div);
};

window.closeEditTeacherModal = () => {
    document.getElementById('editTeacherModal').style.display = 'none';
};

window.saveClassroomTeacher = async () => {
    const id = document.getElementById('editTeacherRoomId').value;
    const email = document.getElementById('editTeacherEmail').value.trim();
    
    const nameInputs = document.querySelectorAll('.teacher-name-input');
    const teacherNames = Array.from(nameInputs)
        .map(input => input.value.trim())
        .filter(name => name !== '');

    const { error } = await supabase
        .from('classroom_teachers')
        .update({
            email: email,
            teacher_names: teacherNames,
            updated_at: new Date()
        })
        .eq('id', id);

    if (error) {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        closeEditTeacherModal();
        showToast('บันทึกข้อมูลครูประจำชั้นเรียบร้อยแล้ว', 'success');
        loadClassroomTeachers();
    }
};

// Open/Close Other Staff Modal
window.openAddStaffModal = () => {
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-email').value = '';
    document.getElementById('staff-phone').value = '';
    document.getElementById('staffError').style.display = 'none';
    document.getElementById('addStaffModal').style.display = 'flex';
};

window.closeAddStaffModal = () => {
    document.getElementById('addStaffModal').style.display = 'none';
};

window.saveStaffMember = async () => {
    const name = document.getElementById('staff-name').value.trim();
    const role = document.getElementById('staff-role').value;
    const email = document.getElementById('staff-email').value.trim();
    const phone = document.getElementById('staff-phone').value.trim();
    const errorMsg = document.getElementById('staffError');

    if (!name || !email) {
        errorMsg.textContent = 'กรุณากรอกชื่อ-นามสกุล และอีเมลให้ครบถ้วน';
        errorMsg.style.display = 'block';
        return;
    }

    const { error } = await supabase
        .from('staff_members')
        .insert([{ name, role, email, phone }]);

    if (error) {
        errorMsg.textContent = 'บันทึกไม่สำเร็จ: ' + error.message;
        errorMsg.style.display = 'block';
    } else {
        closeAddStaffModal();
        showToast('เพิ่มข้อมูลบุคลากรเรียบร้อยแล้ว', 'success');
        loadOtherStaff();
    }
};

window.deleteStaffMember = async (id, name) => {
    if (!confirm(`คุณต้องการลบข้อมูลของ "${name}" ใช่หรือไม่?`)) return;

    const { error } = await supabase
        .from('staff_members')
        .delete()
        .eq('id', id);

    if (error) {
        showToast('เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        showToast(`ลบข้อมูล "${name}" เรียบร้อยแล้ว`, 'success');
        loadOtherStaff();
    }
};

// ฟังก์ชันสร้างห้องเรียน ม.1/1 ถึง ม.6/10 (60 ห้อง) ตามรูปแบบ m101@mst.ac.th
window.bulkCreateClassrooms = async () => {
    const passwordSuffix = prompt("กำหนดข้อความต่อท้าย xxx ของรหัสผ่าน (เช่น 'mst'):", "mst");
    if (!passwordSuffix) return;

    if (!confirm(`ระบบกำลังจะสร้าง/อัปเดต 60 ห้องเรียน\nยืนยันทำรายการหรือไม่?`)) return;

    let successCount = 0;
    let failCount = 0;

    showToast("กำลังเริ่มดำเนินการ กรุณารอสักครู่...", "info");

    for (let g = 1; g <= 6; g++) {
        for (let r = 1; r <= 10; r++) {
            const gradeStr = `ม.${g}`;
            const roomStr = r.toString();
            const roomPad = r < 10 ? `0${r}` : `${r}`;
            
            const code = `m${g}${roomPad}`;
            const email = `${code}@mst.ac.th`;
            const password = `${code}${passwordSuffix}`;

            // 1. ลองสมัคร Auth
            const { error: authError } = await tempAuthClient.auth.signUp({
                email: email,
                password: password,
                options: { data: { role: 'teacher', grade: gradeStr, room: roomStr } }
            });

            if (authError) {
                console.error(`[Auth Error] ${email}:`, authError.message);
            }

            // 2. ดึงชื่อครูเดิม
            const { data: existing } = await supabase
                .from('classroom_teachers')
                .select('teacher_names')
                .eq('grade_level', gradeStr)
                .eq('room_number', roomStr)
                .maybeSingle();

            const existingNames = existing?.teacher_names || [];

            // 3. Upsert ตาราง DB
            const { error: dbError } = await supabase
                .from('classroom_teachers')
                .upsert({
                    grade_level: gradeStr,
                    room_number: roomStr,
                    email: email,
                    teacher_names: existingNames
                }, { onConflict: 'grade_level,room_number' });

            if (dbError) {
                console.error(`[DB Error] ${gradeStr}/${roomStr}:`, dbError.message);
                failCount++;
            } else {
                successCount++;
            }
        }
    }

    showToast(`เสร็จสิ้น: สำเร็จ ${successCount} / ล้มเหลว ${failCount}`, successCount > 0 ? "success" : "error");
    loadClassroomTeachers();
};


window.loadExecutiveDashboard = async () => {
    const filterEl = document.getElementById('dashGradeFilter');
    const selectedGrade = filterEl ? filterEl.value : 'all';

    // 1. ดึงข้อมูลนักเรียนทั้งหมด
    const students = await fetchAllStudentsFromDB(selectedGrade);

    // 2. ดึงข้อมูลครูประจำชั้น
    let teacherQuery = supabase.from('classroom_teachers').select('grade_level, room_number, is_confirmed, teacher_names');
    if (selectedGrade !== 'all') {
        teacherQuery = teacherQuery.eq('grade_level', selectedGrade);
    }
    const { data: teacherRooms, error: tError } = await teacherQuery;

    if (tError) {
        console.error('Error loading teacher rooms:', tError);
        return;
    }

    // 🔥 สั่งวาดและนับยอดสถานะการยืนยันครูประจำชั้น
    renderTeacherConfirmationStatus(teacherRooms, selectedGrade);

    // 3. คำนวณ KPI Cards สรุปยอดภาพรวม
    let total = students.length;
    let maleCount = 0, femaleCount = 0, activeCount = 0, inactiveCount = 0;
    let absenceCount = 0, transferCount = 0, suspendCount = 0;

    // students.forEach(s => {
    //     const gender = (s.gender || '').trim();
    //     if (gender === 'ชาย' || gender === 'นาย') maleCount++;
    //     else if (gender === 'หญิง' || gender === 'นางสาว' || gender === 'เด็กหญิง') femaleCount++;

    //     const st = (s.status || 'มีตัว').trim();
    //     if (st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ' || st.includes('พักการเรียน'))  {
    //         activeCount++;
    //     } else {
    //         inactiveCount++;
    //         if (st.includes('ขาดเรียน')) absenceCount++;
    //         else if (st.includes('ย้าย')) transferCount++;
    //         // else if (st.includes('พักการเรียน')) suspendCount++;
    //     }
    // });
    students.forEach(s => {
        const gender = (s.gender || '').trim();
        if (gender === 'ชาย' || gender === 'นาย') maleCount++;
        else if (gender === 'หญิง' || gender === 'นางสาว' || gender === 'เด็กหญิง') femaleCount++;

        const st = (s.status || 'มีตัว').trim();
        
        // 🔥 "พักการเรียน" ให้นับรวมเข้า Active (มีตัว/กำลังศึกษา)
        if (st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ' || st.includes('พักการเรียน')) {
            activeCount++;
            if (st.includes('พักการเรียน')) suspendCount++;
        } else {
            // 🔥 สถานะอื่นๆ เหลือเฉพาะ ขาดเรียน และ ย้ายสถานศึกษา
            inactiveCount++;
            if (st.includes('ขาดเรียน')) absenceCount++;
            else if (st.includes('ย้าย')) transferCount++;
        }
    });

    document.getElementById('kpiTotalStudents').textContent = total.toLocaleString();
    document.getElementById('kpiGenderRatio').textContent = `👨 ${maleCount} | 👩 ${femaleCount}`;
    const malePct = total > 0 ? ((maleCount / total) * 100).toFixed(1) : 0;
    const femalePct = total > 0 ? ((femaleCount / total) * 100).toFixed(1) : 0;
    document.getElementById('kpiGenderPercent').textContent = `(ชาย ${malePct}% / หญิง ${femalePct}%)`;
    document.getElementById('kpiActiveStudents').textContent = activeCount.toLocaleString();
    document.getElementById('kpiOtherStatusStudents').innerHTML = `${inactiveCount.toLocaleString()} <span style="font-size: 14px; font-weight: normal; color: #666;">คน</span>`;
    if (document.getElementById('countAbsence')) document.getElementById('countAbsence').textContent = `${absenceCount} คน`;
    if (document.getElementById('countTransfer')) document.getElementById('countTransfer').textContent = `${transferCount} คน`;
    if (document.getElementById('countSuspend')) document.getElementById('countSuspend').textContent = `${suspendCount} คน`;

    // 4. 🔥 ควบคุมการสลับตาราง (แสดงเฉพาะตารางที่เกี่ยวข้อง)
    const gradeSection = document.getElementById('dashGradeSummarySection');
    const roomSection = document.getElementById('dashRoomSummarySection');
    const roomTitle = document.getElementById('dashRoomSummaryTitle');

    if (selectedGrade === 'all') {
        // กรณีเลือก "ทุกระดับชั้น" -> แสดงตารางรายชั้น (ม.1 - ม.6) / ซ่อนตารางรายห้อง
        if (gradeSection) gradeSection.style.display = 'block';
        if (roomSection) roomSection.style.display = 'none';
        renderGradeSummaryTable(students);
    } else {
        // กรณีเลือกระดับชั้นเฉพาะ (เช่น ม.1) -> ซ่อนตารางรายชั้น / แสดงตารางรายห้องของชั้นนั้นๆ
        if (gradeSection) gradeSection.style.display = 'none';
        if (roomSection) roomSection.style.display = 'block';
        if (roomTitle) roomTitle.textContent = `🏫 สรุปจำนวนนักเรียนแยกตามห้องเรียน (${selectedGrade})`;
        renderRoomSummaryTable(students, teacherRooms, selectedGrade);
    }
};

// 1. ฟังก์ชันวาดตารางสรุปรายชั้น (ม.1 - ม.6) พร้อมแถบสรุปรวมทั้งโรงเรียน
// function renderGradeSummaryTable(students) {
//     const tbody = document.getElementById('dashGradeSummaryBody');
//     if (!tbody) return;

//     const grades = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
//     let html = '';

//     // ตัวแปรสะสมยอดรวมทั้งโรงเรียน
//     let grandRooms = 0;
//     let grandMale = 0;
//     let grandFemale = 0;
//     let grandInactive = 0;
//     let grandActive = 0;
//     let grandTotal = 0;

//     grades.forEach(g => {
//         const gradeStudents = students.filter(s => s.grade_level === g);
//         let male = 0, female = 0, active = 0, inactive = 0;

//         gradeStudents.forEach(s => {
//             const gender = (s.gender || '').trim();
//             if (gender === 'ชาย' || gender === 'นาย') male++;
//             else female++;

//             const st = (s.status || 'มีตัว').trim();
//             if (st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ') active++;
//             else inactive++;
//         });

//         const rowTotal = active + inactive;

//         // สะสมยอดรวม
//         grandRooms += 10;
//         grandMale += male;
//         grandFemale += female;
//         grandInactive += inactive;
//         grandActive += active;
//         grandTotal += rowTotal;

//         html += `
//             <tr>
//                 <td style="text-align: center; font-weight: 700; color: var(--primary-purple);">${g}</td>
//                 <td style="text-align: center;">10 ห้อง</td>
//                 <td style="text-align: center; color: #2563eb;">${male}</td>
//                 <td style="text-align: center; color: #db2777;">${female}</td>
//                 <td style="text-align: center; color: #dc2626; font-weight: 700;">${inactive > 0 ? `⚠️ ${inactive}` : '0'}</td>
//                 <td style="text-align: center; color: #16a34a; font-weight: 700; background: #f0fdf4;">${active}</td>
//                 <td style="text-align: center; font-weight: 700; background: #f8fafc;">${rowTotal}</td>
//             </tr>
//         `;
//     });

//     // 🔥 แถบรวบยอดรวมทั้งโรงเรียน (Grand Total Row)
//     html += `
//         <tr style="background: #eef2ff; font-weight: 700; border-top: 2px solid #c7d2fe;">
//             <td style="text-align: center; color: var(--primary-purple); font-size: 15px;">รวมทั้งโรงเรียน</td>
//             <td style="text-align: center; color: #4338ca;">${grandRooms} ห้อง</td>
//             <td style="text-align: center; color: #1d4ed8;">${grandMale.toLocaleString()}</td>
//             <td style="text-align: center; color: #be185d;">${grandFemale.toLocaleString()}</td>
//             <td style="text-align: center; color: #b91c1c;">⚠️ ${grandInactive.toLocaleString()}</td>
//             <td style="text-align: center; color: #15803d; background: #dcfce7;">${grandActive.toLocaleString()}</td>
//             <td style="text-align: center; color: var(--primary-purple); font-size: 16px; background: #e0e7ff;">${grandTotal.toLocaleString()}</td>
//         </tr>
//     `;

//     tbody.innerHTML = html;
// }

// // 2. ฟังก์ชันวาดตารางสรุปรายห้อง พร้อมแถบสรุปรวมประจำชั้น
// function renderRoomSummaryTable(students, teacherRooms, selectedGrade) {
//     const tbody = document.getElementById('dashRoomSummaryBody');
//     if (!tbody) return;

//     let roomsToDisplay = teacherRooms || [];
//     if (selectedGrade !== 'all') {
//         roomsToDisplay = roomsToDisplay.filter(r => r.grade_level === selectedGrade);
//     } else {
//         roomsToDisplay = roomsToDisplay.filter(r => r.grade_level === 'ม.1');
//     }

//     roomsToDisplay.sort((a, b) => a.room_number - b.room_number);

//     let html = '';
//     let roomGroupMale = 0;
//     let roomGroupFemale = 0;
//     let roomGroupInactive = 0;
//     let roomGroupActive = 0;
//     let roomGroupTotal = 0;

//     roomsToDisplay.forEach(r => {
//         const roomStudents = students.filter(s => s.grade_level === r.grade_level && Number(s.room_number) === Number(r.room_number));
//         let male = 0, female = 0, active = 0, inactive = 0;

//         roomStudents.forEach(s => {
//             const gender = (s.gender || '').trim();
//             if (gender === 'ชาย' || gender === 'นาย') male++;
//             else female++;

//             const st = (s.status || 'มีตัว').trim();
//             if (st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ') active++;
//             else inactive++;
//         });

//         const rowTotal = active + inactive;

//         // สะสมยอดรวมรายชั้น
//         roomGroupMale += male;
//         roomGroupFemale += female;
//         roomGroupInactive += inactive;
//         roomGroupActive += active;
//         roomGroupTotal += rowTotal;

//         const teacherName = r.teacher_names || 'ยังไม่ได้ระบุครู';
//         const statusBadge = r.is_confirmed 
//             ? '<span style="color: #16a34a; font-size: 12px; font-weight: 600;">(ยืนยันแล้ว)</span>' 
//             : '<span style="color: #dc2626; font-size: 12px; font-weight: 600;">(รอยืนยัน)</span>';

//         html += `
//             <tr>
//                 <td style="text-align: center; font-weight: 700;">${r.grade_level}/${r.room_number}</td>
//                 <td style="text-align: center; color: #2563eb;">${male}</td>
//                 <td style="text-align: center; color: #db2777;">${female}</td>
//                 <td style="text-align: center; color: #dc2626; font-weight: 700;">${inactive > 0 ? `⚠️ ${inactive}` : '0'}</td>
//                 <td style="text-align: center; color: #16a34a; font-weight: 700; background: #f0fdf4;">${active}</td>
//                 <td style="text-align: center; font-weight: 700; background: #f8fafc;">${rowTotal}</td>
//                 <td>👤 ${teacherName} ${statusBadge}</td>
//             </tr>
//         `;
//     });

//     // 🔥 แถบรวบยอดรวมประจำชั้น (Total Row for Rooms)
//     const currentGradeLabel = selectedGrade !== 'all' ? selectedGrade : 'ม.1';
//     html += `
//         <tr style="background: #eef2ff; font-weight: 700; border-top: 2px solid #c7d2fe;">
//             <td style="text-align: center; color: var(--primary-purple); font-size: 15px;">รวมระดับชั้น ${currentGradeLabel}</td>
//             <td style="text-align: center; color: #1d4ed8;">${roomGroupMale.toLocaleString()}</td>
//             <td style="text-align: center; color: #be185d;">${roomGroupFemale.toLocaleString()}</td>
//             <td style="text-align: center; color: #b91c1c;">⚠️ ${roomGroupInactive.toLocaleString()}</td>
//             <td style="text-align: center; color: #15803d; background: #dcfce7;">${roomGroupActive.toLocaleString()}</td>
//             <td style="text-align: center; color: var(--primary-purple); font-size: 16px; background: #e0e7ff;">${roomGroupTotal.toLocaleString()}</td>
//             <td style="color: #64748b;">(รวม 10 ห้องเรียน)</td>
//         </tr>
//     `;

//     tbody.innerHTML = html;
// }

// 1. ฟังก์ชันวาดตารางสรุปรายชั้น (ม.1 - ม.6) พร้อม data-label สำหรับมือถือ
function renderGradeSummaryTable(students) {
    const tbody = document.getElementById('dashGradeSummaryBody');
    if (!tbody) return;

    const grades = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    let html = '';

    let grandRooms = 0, grandMale = 0, grandFemale = 0;
    let grandInactive = 0, grandActive = 0, grandTotal = 0;

    grades.forEach(g => {
        const gradeStudents = students.filter(s => s.grade_level === g);
        let male = 0, female = 0, active = 0, inactive = 0;

        gradeStudents.forEach(s => {
            const gender = (s.gender || '').trim();
            if (gender === 'ชาย' || gender === 'นาย') male++;
            else female++;

            const st = (s.status || 'มีตัว').trim();
            if (st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ' || st === 'พักการเรียน') active++;
            else inactive++;
        });

        const rowTotal = active + inactive;

        grandRooms += 10;
        grandMale += male;
        grandFemale += female;
        grandInactive += inactive;
        grandActive += active;
        grandTotal += rowTotal;

        // 🔥 ใส่ data-label ทุกคอลัมน์เพื่อให้มือถือดึงชื่อหัวข้อมาแสดง
        html += `
            <tr>
                <td data-label="ระดับชั้น" style="text-align: center; font-weight: 700; color: var(--primary-purple);">${g}</td>
                <td data-label="จำนวนห้อง" style="text-align: center;">10 ห้อง</td>
                <td data-label="ชาย" style="text-align: center; color: #2563eb;">${male}</td>
                <td data-label="หญิง" style="text-align: center; color: #db2777;">${female}</td>
                <td data-label="สถานะอื่นๆ" style="text-align: center; color: #dc2626; font-weight: 700;">${inactive > 0 ? `⚠️ ${inactive}` : '0'}</td>
                <td data-label="มีตัว" style="text-align: center; color: #16a34a; font-weight: 700; background: #f0fdf4;">${active}</td>
                <td data-label="รวมทั้งหมด" style="text-align: center; font-weight: 700; background: #f8fafc;">${rowTotal}</td>
            </tr>
        `;
    });

    // แถบรวบยอดรวมทั้งโรงเรียน
    html += `
        <tr style="background: #eef2ff; font-weight: 700; border-top: 2px solid #c7d2fe;">
            <td data-label="ระดับชั้น" style="text-align: center; color: var(--primary-purple); font-size: 15px;">รวมทั้งโรงเรียน</td>
            <td data-label="จำนวนห้อง" style="text-align: center; color: #4338ca;">${grandRooms} ห้อง</td>
            <td data-label="ชาย" style="text-align: center; color: #1d4ed8;">${grandMale.toLocaleString()}</td>
            <td data-label="หญิง" style="text-align: center; color: #be185d;">${grandFemale.toLocaleString()}</td>
            <td data-label="สถานะอื่นๆ" style="text-align: center; color: #b91c1c;">⚠️ ${grandInactive.toLocaleString()}</td>
            <td data-label="มีตัว" style="text-align: center; color: #15803d; background: #dcfce7;">${grandActive.toLocaleString()}</td>
            <td data-label="รวมทั้งหมด" style="text-align: center; color: var(--primary-purple); font-size: 16px; background: #e0e7ff;">${grandTotal.toLocaleString()}</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

// 2. ฟังก์ชันวาดตารางสรุปรายห้อง พร้อม data-label สำหรับมือถือ
function renderRoomSummaryTable(students, teacherRooms, selectedGrade) {
    const tbody = document.getElementById('dashRoomSummaryBody');
    if (!tbody) return;

    let roomsToDisplay = teacherRooms || [];
    if (selectedGrade !== 'all') {
        roomsToDisplay = roomsToDisplay.filter(r => r.grade_level === selectedGrade);
    } else {
        roomsToDisplay = roomsToDisplay.filter(r => r.grade_level === 'ม.1');
    }

    roomsToDisplay.sort((a, b) => a.room_number - b.room_number);

    let html = '';
    let roomGroupMale = 0, roomGroupFemale = 0;
    let roomGroupInactive = 0, roomGroupActive = 0, roomGroupTotal = 0;

    roomsToDisplay.forEach(r => {
        const roomStudents = students.filter(s => s.grade_level === r.grade_level && Number(s.room_number) === Number(r.room_number));
        let male = 0, female = 0, active = 0, inactive = 0;

        roomStudents.forEach(s => {
            const gender = (s.gender || '').trim();
            if (gender === 'ชาย' || gender === 'นาย') male++;
            else female++;

            const st = (s.status || 'มีตัว').trim();
            if (st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ') active++;
            else inactive++;
        });

        const rowTotal = active + inactive;

        roomGroupMale += male;
        roomGroupFemale += female;
        roomGroupInactive += inactive;
        roomGroupActive += active;
        roomGroupTotal += rowTotal;

        const teacherName = r.teacher_names || 'ยังไม่ได้ระบุครู';
        const statusBadge = r.is_confirmed 
            ? '<span style="color: #16a34a; font-size: 12px; font-weight: 600;">(ยืนยันแล้ว)</span>' 
            : '<span style="color: #dc2626; font-size: 12px; font-weight: 600;">(รอยืนยัน)</span>';

        // 🔥 ใส่ data-label ทุกคอลัมน์
        html += `
            <tr>
                <td data-label="ห้องเรียน" style="text-align: center; font-weight: 700;">${r.grade_level}/${r.room_number}</td>
                <td data-label="ชาย" style="text-align: center; color: #2563eb;">${male}</td>
                <td data-label="หญิง" style="text-align: center; color: #db2777;">${female}</td>
                <td data-label="สถานะอื่นๆ" style="text-align: center; color: #dc2626; font-weight: 700;">${inactive > 0 ? `⚠️ ${inactive}` : '0'}</td>
                <td data-label="มีตัว" style="text-align: center; color: #16a34a; font-weight: 700; background: #f0fdf4;">${active}</td>
                <td data-label="รวมทั้งหมด" style="text-align: center; font-weight: 700; background: #f8fafc;">${rowTotal}</td>
                <td data-label="ครูประจำชั้น">👤 ${teacherName} ${statusBadge}</td>
            </tr>
        `;
    });

    const currentGradeLabel = selectedGrade !== 'all' ? selectedGrade : 'ม.1';
    html += `
        <tr style="background: #eef2ff; font-weight: 700; border-top: 2px solid #c7d2fe;">
            <td data-label="ห้องเรียน" style="text-align: center; color: var(--primary-purple); font-size: 15px;">รวมระดับชั้น ${currentGradeLabel}</td>
            <td data-label="ชาย" style="text-align: center; color: #1d4ed8;">${roomGroupMale.toLocaleString()}</td>
            <td data-label="หญิง" style="text-align: center; color: #be185d;">${roomGroupFemale.toLocaleString()}</td>
            <td data-label="สถานะอื่นๆ" style="text-align: center; color: #b91c1c;">⚠️ ${roomGroupInactive.toLocaleString()}</td>
            <td data-label="มีตัว" style="text-align: center; color: #15803d; background: #dcfce7;">${roomGroupActive.toLocaleString()}</td>
            <td data-label="รวมทั้งหมด" style="text-align: center; color: var(--primary-purple); font-size: 16px; background: #e0e7ff;">${roomGroupTotal.toLocaleString()}</td>
            <td data-label="หมายเหตุ" style="color: #64748b;">(รวม 10 ห้องเรียน)</td>
        </tr>
    `;

    tbody.innerHTML = html;
}


async function restoreSessionPermissions(userEmail) {
    try {
        let role = 'admin';
        let grade = '';
        let room = '';
        let displayName = '';

        // เช็คตารางครูประจำชั้น
        const { data: teacherData } = await supabase
            .from('classroom_teachers')
            .select('grade_level, room_number, teacher_names')
            .eq('email', userEmail)
            .maybeSingle();

        if (teacherData && teacherData.grade_level && teacherData.room_number) {
            role = 'teacher';
            grade = teacherData.grade_level;
            room = teacherData.room_number;
            const names = teacherData.teacher_names || [];
            displayName = names.length > 0 ? names.join(', ') : 'ครูประจำชั้น';
        } else {
            // เช็คตารางบุคลากร/ผู้บริหาร
            const { data: staffData } = await supabase
                .from('staff_members')
                .select('name, role')
                .eq('email', userEmail)
                .maybeSingle();

            if (staffData && staffData.role) {
                role = staffData.role;
                displayName = staffData.name || '';
            } else {
                displayName = 'ผู้ดูแลระบบ';
            }
        }

        // บันทึกสิทธิ์กลับลง LocalStorage
        localStorage.setItem('userRole', role);
        localStorage.setItem('userGrade', grade);
        localStorage.setItem('userRoom', room);
        localStorage.setItem('userDisplayName', displayName);

        return role;
    } catch (err) {
        console.error('Error restoring session permissions:', err);
        return 'admin';
    }
}

// 2. ตัวตรวจจับสถานะ Auth อัจฉริยะ (ทำงานอัตโนมัติทันทีที่ Supabase โหลดเสร็จ)
supabase.auth.onAuthStateChange(async (event, session) => {
    const loginSec = document.getElementById('loginSection');
    const appSec = document.getElementById('appSection');

    if (session && session.user) {
        // ✅ มี Session ค้างอยู่ -> แสดงหน้าแอปพลิเคชันทันที
        if (loginSec) loginSec.style.display = 'none';
        if (appSec) appSec.style.display = 'flex';

        // เช็คสิทธิ์ผู้ใช้
        let role = localStorage.getItem('userRole');
        if (!role) {
            await restoreSessionPermissions(session.user.email);
        }

        // ปรับแต่ง UI และปุ่มตามสิทธิ์
        await applyRoleRestrictions();

    } else {
        // ❌ ไม่มี Session หรือกด Logout -> สลับไปหน้า เข้าสู่ระบบ
        if (loginSec) loginSec.style.display = 'flex';
        if (appSec) appSec.style.display = 'none';
    }
});

// ==========================================
// ฟังก์ชันจัดเรียงข้อมูลนักเรียน (Sorting Helper)
// ==========================================
function sortStudentData(data, sortBy = 'gender_code') {
    if (!data || !Array.isArray(data)) return [];

    return data.sort((a, b) => {
        if (sortBy === 'gender_code') {
            // 1. แยกกลุ่มเพศ: ชาย (นาย/เด็กชาย) ขึ้นก่อน หญิง (นางสาว/เด็กหญิง)
            const genderA = (a.gender || '').trim();
            const genderB = (b.gender || '').trim();

            const isMaleA = genderA === 'ชาย' || genderA === 'นาย' || genderA.includes('ชาย');
            const isMaleB = genderB === 'ชาย' || genderB === 'นาย' || genderB.includes('ชาย');

            if (isMaleA && !isMaleB) return -1;
            if (!isMaleA && isMaleB) return 1;

            // 2. ถ้าเพศเดียวกัน ให้เรียงตามรหัสนักเรียนจาก น้อย -> มาก (Numeric Comparison)
            const codeA = (a.student_code || '').toString();
            const codeB = (b.student_code || '').toString();
            return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
        } 
        else if (sortBy === 'code_asc') {
            // เรียงรหัสนักเรียน (น้อย -> มาก)
            const codeA = (a.student_code || '').toString();
            const codeB = (b.student_code || '').toString();
            return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
        } 
        else if (sortBy === 'code_desc') {
            // เรียงรหัสนักเรียน (มาก -> น้อย)
            const codeA = (a.student_code || '').toString();
            const codeB = (b.student_code || '').toString();
            return codeB.localeCompare(codeA, undefined, { numeric: true, sensitivity: 'base' });
        } 
        else if (sortBy === 'name_asc') {
            // เรียงตามชื่อ-นามสกุล (ก -> ฮ)
            const nameA = `${a.first_name || ''} ${a.last_name || ''}`;
            const nameB = `${b.first_name || ''} ${b.last_name || ''}`;
            return nameA.localeCompare(nameB, 'th');
        }
        return 0;
    });
}

// ฟังก์ชันเมื่อมีการเปลี่ยนการเรียงลำดับ หรือค้นหาข้อมูลใหม่
window.applySortingAndRender = () => {
    if (!window.currentStudentsData || window.currentStudentsData.length === 0) return;

    const sortEl = document.getElementById('sortBySelect');
    const sortVal = sortEl ? sortEl.value : 'gender_code';

    // เรียงลำดับข้อมูลในชุดปัจจุบัน
    window.currentStudentsData = sortStudentData(window.currentStudentsData, sortVal);

    // รีเซ็ตหน้ากลับไปหน้า 1 และวาดตารางใหม่
    currentPage = 1;
    renderStudentTablePage();
};

// ==========================================
// ระบบจัดการหน้ารายงาน "นักเรียนไม่มีตัว / สถานะอื่นๆ"
// ==========================================

// ตัวแปรเก็บข้อมูลนักเรียนไม่มีตัวทั้งหมดใน Memory
window.rawInactiveStudents = [];

// ฟังก์ชันหลักโหลดข้อมูลหน้ารายงานนักเรียนไม่มีตัว
async function loadInactiveStudentsView() {
    const listBody = document.getElementById('inactiveStudentListBody');
    const summaryBody = document.getElementById('inactiveGradeSummaryBody');
    if (listBody) listBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">กำลังโหลดข้อมูลนักเรียนไม่มีตัว...</td></tr>';

    // 1. ดึงข้อมูลนักเรียนทั้งหมดทะลุ 1,000 คน
    const allStudents = await fetchAllStudentsFromDB('all');

    // 2. กรองเฉพาะนักเรียนที่ไม่ได้มีสถานะ "มีตัว / กำลังศึกษา / ปกติ"
    window.rawInactiveStudents = allStudents.filter(s => {
        const st = (s.status || 'มีตัว').trim();
        return !(st === 'มีตัว' || st === 'กำลังศึกษา' || st === 'ปกติ' || st.includes('พักการเรียน'));
    });

    // 3. คำนวณและอัปเดต KPI Cards
    updateInactiveKPICards(window.rawInactiveStudents);

    // 4. กรอง จัดเรียง และแสดงผลตาราง
    filterAndRenderInactiveView();
}

// อัปเดตการ์ด KPI หน้ารายงานนักเรียนไม่มีตัว
function updateInactiveKPICards(data) {
    let total = data.length;
    let absence = 0, transfer = 0, suspend = 0;

    data.forEach(s => {
        const st = (s.status || '').trim();
        if (st.includes('ขาดเรียน')) absence++;
        else if (st.includes('ย้าย')) transfer++;
        //else if (st.includes('พักการเรียน')) suspend++;
    });

    document.getElementById('inactiveKpiTotal').textContent = total.toLocaleString();
    document.getElementById('inactiveKpiAbsence').textContent = absence.toLocaleString();
    document.getElementById('inactiveKpiTransfer').textContent = transfer.toLocaleString();
    //document.getElementById('inactiveKpiSuspend').textContent = suspend.toLocaleString();
}

// ฟังก์ชันกรองข้อมูล จัดเรียง และสั่งวาดตารางสรุป/รายชื่อ
window.filterAndRenderInactiveView = () => {
    let list = [...window.rawInactiveStudents];

    const gradeVal = document.getElementById('inactiveGradeFilter')?.value || 'all';
    const statusVal = document.getElementById('inactiveStatusFilter')?.value || 'all';
    const sortVal = document.getElementById('inactiveSortBy')?.value || 'status';

    // 1. กรองตามระดับชั้น
    if (gradeVal !== 'all') {
        list = list.filter(s => s.grade_level === gradeVal);
    }

    // 2. กรองตามประเภทสถานะ
    if (statusVal !== 'all') {
        list = list.filter(s => (s.status || '').includes(statusVal));
    }

    // 3. จัดเรียงข้อมูล
    list.sort((a, b) => {
        if (sortVal === 'status') {
            return (a.status || '').localeCompare(b.status || '', 'th');
        } else if (sortVal === 'grade_room') {
            const grA = `${a.grade_level}/${a.room_number.toString().padStart(2, '0')}`;
            const grB = `${b.grade_level}/${b.room_number.toString().padStart(2, '0')}`;
            return grA.localeCompare(grB, undefined, { numeric: true });
        } else if (sortVal === 'gender_code') {
            const isMaleA = a.gender === 'ชาย' || a.gender === 'นาย';
            const isMaleB = b.gender === 'ชาย' || b.gender === 'นาย';
            if (isMaleA && !isMaleB) return -1;
            if (!isMaleA && isMaleB) return 1;
            return (a.student_code || '').toString().localeCompare((b.student_code || '').toString(), undefined, { numeric: true });
        } else if (sortVal === 'code_asc') {
            return (a.student_code || '').toString().localeCompare((b.student_code || '').toString(), undefined, { numeric: true });
        }
        return 0;
    });

    // 🔥 บันทึกชุดข้อมูลปัจจุบันที่ผ่านการกรองและจัดเรียงไว้เพื่อ Export
    window.currentFilteredInactiveStudents = list;

    // 4. วาดตารางสรุปรายชั้น และวาดตารางรายชื่อนักเรียน
    renderInactiveGradeSummaryTable(list);
    renderInactiveStudentListTable(list);
};

// วาดตารางสรุปจำนวนนักเรียนไม่มีตัวแยกตามชั้น (ม.1 - ม.6)
function renderInactiveGradeSummaryTable(data) {
    const summaryBody = document.getElementById('inactiveGradeSummaryBody');
    if (!summaryBody) return;

    const grades = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    let html = '';

    grades.forEach(g => {
        const gradeStudents = data.filter(s => s.grade_level === g);
        let abs = 0, trans = 0, susp = 0;

        gradeStudents.forEach(s => {
            const st = (s.status || '').trim();
            if (st.includes('ขาดเรียน')) abs++;
            else if (st.includes('ย้าย')) trans++;
            else if (st.includes('พักการเรียน')) susp++;
        });

        const totalGrade = abs + trans + susp;

    //     html += `
    //         <tr>
    //             <td data-label="ระดับชั้น" style="text-align: center; font-weight: 700; color: var(--primary-purple);">${g}</td>
    //             <td data-label="ขาดเรียนนาน" style="text-align: center; color: #be123c; font-weight: 600;">${abs}</td>
    //             <td data-label="ย้ายสถานศึกษา" style="text-align: center; color: #c2410c; font-weight: 600;">${trans}</td>
    //             <td data-label="พักการเรียน" style="text-align: center; color: #d97706; font-weight: 600;">${susp}</td>
    //             <td data-label="รวมทั้งหมด" style="text-align: center; font-weight: 700; background: #faf5ff; color: var(--primary-purple);">${totalGrade}</td>
    //         </tr>
    //     `;
    // });
     html += `
            <tr>
                <td data-label="ระดับชั้น" style="text-align: center; font-weight: 700; color: var(--primary-purple);">${g}</td>
                <td data-label="ขาดเรียนนาน" style="text-align: center; color: #be123c; font-weight: 600;">${abs}</td>
                <td data-label="ย้ายสถานศึกษา" style="text-align: center; color: #c2410c; font-weight: 600;">${trans}</td>
                
                <td data-label="รวมทั้งหมด" style="text-align: center; font-weight: 700; background: #faf5ff; color: var(--primary-purple);">${totalGrade}</td>
            </tr>
        `;
    });

    summaryBody.innerHTML = html;
}


// วาดตาราง/การ์ดรายชื่อนักเรียนไม่มีตัวรายบุคคล
function renderInactiveStudentListTable(data) {
    const listBody = document.getElementById('inactiveStudentListBody');
    if (!listBody) return;

    const role = localStorage.getItem('userRole');
    const isExecutive = (role === 'executive');
    const canEdit = !isExecutive && (window.isSystemOpen || role === 'admin' || role === 'registrar');

    if (data.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก</td></tr>';
        return;
    }

    let html = '';
    data.forEach((student, index) => {
        let statusBadgeColor = '#be123c';
        let statusBg = '#fff1f2';
        const st = (student.status || '').trim();

        if (st.includes('ย้าย')) { statusBadgeColor = '#c2410c'; statusBg = '#fff7ed'; }
        else if (st.includes('พักการเรียน')) { statusBadgeColor = '#b45309'; statusBg = '#fffbeb'; }

        html += `
            <tr>
                <td data-label="ลำดับ" style="text-align: center; font-weight: 600; color: #64748b;">${index + 1}</td>
                <td data-label="รหัสนักเรียน"><b>${student.student_code}</b></td>
                <td data-label="ระดับชั้น/ห้อง">${student.grade_level}/${student.room_number}</td>
                <td data-label="ชื่อ-นามสกุล">${student.prefix}${student.first_name} ${student.last_name}</td>
                <td data-label="เพศ">${student.gender}</td>
                <td data-label="สถานะปัจจุบัน">
                    <span style="padding: 4px 10px; border-radius: 12px; background: ${statusBg}; color: ${statusBadgeColor}; font-weight: 700; font-size: 13px; display: inline-block;">
                        ${student.status}
                    </span>
                </td>
                <td data-label="อัปเดตสถานะ" style="text-align: center;">
                    <select id="inactive-status-${student.id}" ${!canEdit ? 'disabled' : ''} style="padding: 5px 8px; border-radius: 4px; border: 1px solid #cbd5e1; font-size: 13px;">
                        <option value="มีตัว" ${st === 'มีตัว' ? 'selected' : ''}>มีตัว (กลับมาเรียน)</option>
                        <option value="ขาดเรียนติดต่อกันเป็นเวลานาน" ${st.includes('ขาดเรียน') ? 'selected' : ''}>ขาดเรียนติดต่อกันเป็นเวลานาน</option>
                        <option value="ย้ายสถานศึกษา" ${st.includes('ย้าย') ? 'selected' : ''}>ย้ายสถานศึกษา</option>
                        <option value="พักการเรียน" ${st.includes('พักการเรียน') ? 'selected' : ''}>พักการเรียน</option>
                    </select>
                    ${canEdit ? `<button onclick="updateInactiveStudentStatus('${student.id}')" class="btn-save-status" style="margin-left: 5px; cursor: pointer;">บันทึก</button>` : ''}
                </td>
            </tr>
        `;
    });

    listBody.innerHTML = html;
}


// 🔥 ผูกฟังก์ชันอัปเดตสถานะเข้ากับ window เพื่อให้ HTML onclick เรียกใช้งานได้
window.updateInactiveStudentStatus = async (studentId) => {
    const selectEl = document.getElementById(`inactive-status-${studentId}`);
    if (!selectEl) return;

    const newStatus = selectEl.value;

    try {
        const { error } = await supabase
            .from('students')
            .update({ status: newStatus })
            .eq('id', studentId);

        if (error) throw error;

        // แสดงการแจ้งเตือนสำเร็จ
        if (typeof showToast === 'function') {
            showToast('อัปเดตสถานะนักเรียนเรียบร้อยแล้ว', 'success');
        } else {
            alert('อัปเดตสถานะนักเรียนเรียบร้อยแล้ว');
        }

        // โหลดข้อมูลหน้ารายงานใหม่ เพื่ออัปเดต KPI Cards และสรุปย่อยทันที
        await loadInactiveStudentsView();
    } catch (err) {
        console.error('Error updating status:', err);
        if (typeof showToast === 'function') {
            showToast('ไม่สามารถอัปเดตสถานะได้: ' + (err.message || ''), 'error');
        } else {
            alert('ไม่สามารถอัปเดตสถานะได้');
        }
    }
};

// ==========================================
// ฟังก์ชัน Export รายชื่อนักเรียนไม่มีตัวเป็นไฟล์ CSV (Excel)
// ==========================================
window.exportInactiveStudentsCSV = () => {
    const data = window.currentFilteredInactiveStudents || window.rawInactiveStudents || [];

    if (data.length === 0) {
        showToast('ไม่พบข้อมูลนักเรียนสำหรับส่งออก', 'error');
        return;
    }

    // 1. เพิ่ม BOM (\uFEFF) ป้องกันภาษาไทยต่างดาวใน Excel
    let csvContent = '\uFEFF';

    // 2. หัวตาราง (Headers)
    csvContent += 'ลำดับ,รหัสนักเรียน,ระดับชั้น,ห้อง,คำนำหน้า,ชื่อ,นามสกุล,เพศ,สถานะปัจจุบัน\n';

    // 3. วนลูปสร้างข้อมูลแต่ละแถว
    data.forEach((student, index) => {
        const row = [
            index + 1,
            `"${student.student_code || ''}"`,  // ครอบอักขระป้องกันเลข 0 นำหน้าโดนตัดใน Excel
            `"${student.grade_level || ''}"`,
            `"${student.room_number || ''}"`,
            `"${student.prefix || ''}"`,
            `"${student.first_name || ''}"`,
            `"${student.last_name || ''}"`,
            `"${student.gender || ''}"`,
            `"${student.status || ''}"`
        ].join(',');
        csvContent += row + '\n';
    });

    // 4. สร้าง Blob ลิงก์ดาวน์โหลด
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // ตั้งชื่อไฟล์ตามวันที่ปัจจุบัน เช่น รายชื่อนักเรียนไม่มีตัว_2026-11-07.csv
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `รายชื่อนักเรียนไม่มีตัว_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`ส่งออกข้อมูลนักเรียนจำนวน ${data.length} รายการ เรียบร้อยแล้ว`, 'success');
};

// ฟังก์ชันนับยอดและวาดสถานะการยืนยันของครูประจำชั้น
// function renderTeacherConfirmationStatus(teacherRooms, selectedGrade) {
//     const confirmedCountEl = document.getElementById('dashConfirmedCount');
//     const unconfirmedCountEl = document.getElementById('dashUnconfirmedCount');
//     const totalRoomsTextEl = document.getElementById('dashTeacherTotalRoomsText');
//     const gridEl = document.getElementById('dashTeacherConfirmationGrid');

//     if (!teacherRooms) return;

//     let confirmed = 0;
//     let unconfirmed = 0;

//     teacherRooms.forEach(r => {
//         if (r.is_confirmed) confirmed++;
//         else unconfirmed++;
//     });

//     const totalRooms = teacherRooms.length;

//     // 1. อัปเดตตัวเลขบนป้ายสรุป
//     if (confirmedCountEl) confirmedCountEl.textContent = confirmed;
//     if (unconfirmedCountEl) unconfirmedCountEl.textContent = unconfirmed;
//     if (totalRoomsTextEl) {
//         totalRoomsTextEl.textContent = selectedGrade === 'all' ? '60 ห้องเรียน' : `${totalRooms} ห้องเรียน`;
//     }

//     if (!gridEl) return;

//     // 2. จัดเรียงห้อง ม.1/1 -> ม.6/10
//     const sortedRooms = [...teacherRooms].sort((a, b) => {
//         if (a.grade_level !== b.grade_level) {
//             return a.grade_level.localeCompare(b.grade_level, 'th');
//         }
//         return Number(a.room_number) - Number(b.room_number);
//     });

//     // 3. วาดป้าย Badge แสดงสถานะแต่ละห้อง
//     let html = '';
//     sortedRooms.forEach(r => {
//         const isDone = r.is_confirmed;
//         const bg = isDone ? '#f0fdf4' : '#fff1f2';
//         const color = isDone ? '#16a34a' : '#be123c';
//         const border = isDone ? '#bbf7d0' : '#fecdd3';
//         const icon = isDone ? '✅' : '⏳';

//         html += `
//             <div style="background: ${bg}; color: ${color}; border: 1px solid ${border}; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
//                 <span>${icon}</span>
//                 <span>${r.grade_level}/${r.room_number}</span>
//             </div>
//         `;
//     });

//     gridEl.innerHTML = html;
// }
// ตัวแปรเก็บสถานะการกรองใน Memory
window.currentConfirmFilter = 'all'; // 'all' | 'confirmed' | 'unconfirmed'
window.lastTeacherRoomsData = null;
window.lastSelectedGrade = 'all';

// 🔥 ฟังก์ชันสลับตัวกรองเมื่อกดคลิกป้าย
window.setConfirmStatusFilter = (filterType) => {
    window.currentConfirmFilter = filterType;
    if (window.lastTeacherRoomsData) {
        renderTeacherConfirmationStatus(window.lastTeacherRoomsData, window.lastSelectedGrade);
    }
};

// ฟังก์ชันนับยอดและวาดสถานะการยืนยันตาม Filter ที่เลือก
function renderTeacherConfirmationStatus(teacherRooms, selectedGrade) {
    window.lastTeacherRoomsData = teacherRooms;
    window.lastSelectedGrade = selectedGrade;

    const confirmedCountEl = document.getElementById('dashConfirmedCount');
    const unconfirmedCountEl = document.getElementById('dashUnconfirmedCount');
    const totalRoomsBadgeEl = document.getElementById('dashTotalRoomsBadge');
    const totalRoomsTextEl = document.getElementById('dashTeacherTotalRoomsText');
    const gridEl = document.getElementById('dashTeacherConfirmationGrid');

    if (!teacherRooms) return;

    // 1. คำนวณนับยอดรวมภาพรวม
    let confirmed = 0;
    let unconfirmed = 0;

    teacherRooms.forEach(r => {
        if (r.is_confirmed) confirmed++;
        else unconfirmed++;
    });

    const totalRooms = teacherRooms.length;

    if (confirmedCountEl) confirmedCountEl.textContent = confirmed;
    if (unconfirmedCountEl) unconfirmedCountEl.textContent = unconfirmed;
    if (totalRoomsBadgeEl) totalRoomsBadgeEl.textContent = totalRooms;
    if (totalRoomsTextEl) {
        totalRoomsTextEl.textContent = selectedGrade === 'all' ? '60 ห้องเรียน' : `${totalRooms} ห้องเรียน`;
    }

    // 2. ไฮไลต์ป้ายปุ่มกรองที่กำลังใช้งานอยู่ (Active Highlight)
    const btnAll = document.getElementById('btnFilterConfirmAll');
    const btnConfirmed = document.getElementById('btnFilterConfirmed');
    const btnUnconfirmed = document.getElementById('btnFilterUnconfirmed');

    if (btnAll) {
        btnAll.style.boxShadow = window.currentConfirmFilter === 'all' ? '0 0 0 3px #64748b' : 'none';
        btnAll.style.transform = window.currentConfirmFilter === 'all' ? 'scale(1.03)' : 'scale(1)';
    }
    if (btnConfirmed) {
        btnConfirmed.style.boxShadow = window.currentConfirmFilter === 'confirmed' ? '0 0 0 3px #16a34a' : 'none';
        btnConfirmed.style.transform = window.currentConfirmFilter === 'confirmed' ? 'scale(1.03)' : 'scale(1)';
    }
    if (btnUnconfirmed) {
        btnUnconfirmed.style.boxShadow = window.currentConfirmFilter === 'unconfirmed' ? '0 0 0 3px #be123c' : 'none';
        btnUnconfirmed.style.transform = window.currentConfirmFilter === 'unconfirmed' ? 'scale(1.03)' : 'scale(1)';
    }

    if (!gridEl) return;

    // 3. 🔥 กรองห้องเรียนตามป้ายสถานะที่เลือก
    let filteredRooms = teacherRooms.filter(r => {
        if (window.currentConfirmFilter === 'confirmed') return !!r.is_confirmed;
        if (window.currentConfirmFilter === 'unconfirmed') return !r.is_confirmed;
        return true; // 'all'
    });

    // จัดเรียงห้อง ม.1/1 -> ม.6/10
    const sortedRooms = [...filteredRooms].sort((a, b) => {
        if (a.grade_level !== b.grade_level) {
            return a.grade_level.localeCompare(b.grade_level, 'th');
        }
        return Number(a.room_number) - Number(b.room_number);
    });

    if (sortedRooms.length === 0) {
        gridEl.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #94a3b8; padding: 20px 0; font-size: 14px;">ไม่พบห้องเรียนตามเงื่อนไขที่เลือก</div>`;
        return;
    }

    // 4. วาดป้ายห้องเรียนที่ผ่านการกรอง
    let html = '';
    sortedRooms.forEach(r => {
        const isDone = r.is_confirmed;
        const bg = isDone ? '#f0fdf4' : '#fff1f2';
        const color = isDone ? '#16a34a' : '#be123c';
        const border = isDone ? '#bbf7d0' : '#fecdd3';
        const icon = isDone ? '✅' : '⏳';

        html += `
            <div style="background: ${bg}; color: ${color}; border: 1px solid ${border}; padding: 6px 10px; border-radius: 8px; font-size: 13px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
                <span>${icon}</span>
                <span>${r.grade_level}/${r.room_number}</span>
            </div>
        `;
    });

    gridEl.innerHTML = html;
}

// 🔥 โหลดสถานะการยืนยันของทุกห้องเรียนเก็บใน Memory
// 🔥 เหลือไว้แค่ชุดเดียวที่ท้ายไฟล์ app.js
window.loadConfirmedRoomsMap = async () => {
    try {
        const { data, error } = await supabase
            .from('classroom_teachers')
            .select('grade_level, room_number, is_confirmed');

        if (error) throw error;

        window.confirmedRoomsMap = {};
        if (data) {
            data.forEach(r => {
                const g = (r.grade_level || '').trim();
                const rm = Number(r.room_number);
                const key = `${g}/${rm}`;
                window.confirmedRoomsMap[key] = !!r.is_confirmed;
            });
        }
        console.log('📌 สถานะการยืนยันห้องเรียน:', window.confirmedRoomsMap);
    } catch (err) {
        console.error('Error loading confirmed rooms map:', err);
    }
};

// 🔥 ระบบสลับเปิด/ปิดการแสดงรหัสผ่านหน้า Login
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('togglePasswordBtn');
    const passwordInput = document.getElementById('password');
    const eyeIcon = document.getElementById('eyeIcon');

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            
            // สลับชนิด Input ระหว่าง password และ text
            passwordInput.type = isPassword ? 'text' : 'password';
            
            // สลับสัญลักษณ์ไอคอน (👁️ = ซ่อนรหัส, 🙈 = แสดงรหัส)
            if (eyeIcon) {
                eyeIcon.textContent = isPassword ? '🙈' : '👁️';
            }
        });
    }
});


// ==========================================
//  ระบบจัดการหน้ารายงานนักเรียนพักการเรียน (ติดผูกกับ window)
// ==========================================

// 1. โหลดข้อมูลนักเรียนพักการเรียน
window.loadSuspendedStudentsView = async () => {
    const listBody = document.getElementById('suspendedStudentListBody');
    if (listBody) {
        listBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">กำลังโหลดข้อมูลนักเรียนพักการเรียน...</td></tr>';
    }

    // ดึงนักเรียนทั้งหมด
    const allStudents = await fetchAllStudentsFromDB('all');

    // 🔥 กรองเฉพาะนักเรียนที่มีสถานะ "พักการเรียน"
    window.rawSuspendedStudents = allStudents.filter(s => {
        const st = (s.status || '').trim();
        return st.includes('พักการเรียน');
    });

    // อัปเดตการ์ด KPI และตารางสรุป
    updateSuspendedKPICards(window.rawSuspendedStudents);
    renderSuspendedGradeSummaryTable(window.rawSuspendedStudents);
    window.filterAndRenderSuspendedView();
};

// 2. 🔥 ฟังก์ชันกรองและวาดตารางรายชื่อนักเรียน (ผูกเข้ากับ window เพื่อให้ HTML onchange / onkeyup เรียกได้)
window.filterAndRenderSuspendedView = () => {
    const listBody = document.getElementById('suspendedStudentListBody');
    if (!listBody || !window.rawSuspendedStudents) return;

    const gradeFilter = document.getElementById('suspendedFilterGrade') ? document.getElementById('suspendedFilterGrade').value : 'all';
    const searchText = document.getElementById('suspendedSearchInput') ? document.getElementById('suspendedSearchInput').value.trim().toLowerCase() : '';

    let filtered = [...window.rawSuspendedStudents];

    if (gradeFilter !== 'all') {
        filtered = filtered.filter(s => s.grade_level === gradeFilter);
    }

    if (searchText !== '') {
        filtered = filtered.filter(s => 
            (s.student_id && s.student_id.toLowerCase().includes(searchText)) ||
            (s.first_name && s.first_name.toLowerCase().includes(searchText))
        );
    }

    if (filtered.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 20px;">ไม่พบข้อมูลนักเรียนพักการเรียน</td></tr>';
        return;
    }

    let html = '';
    filtered.forEach((s, idx) => {
        html += `
            <tr>
                <td data-label="ลำดับ" style="text-align: center;">${idx + 1}</td>
                <td data-label="เลขประจำตัว" style="text-align: center; font-weight: 600;">${s.student_id || '-'}</td>
                <td data-label="ชื่อ-นามสกุล" style="font-weight: 600;">${s.prefix || ''}${s.first_name || ''}  ${s.last_name || ''}</td>
                <td data-label="ชั้น/ห้อง" style="text-align: center;">${s.grade_level}/${s.room_number}</td>
                <td data-label="เพศ" style="text-align: center;">${s.gender || '-'}</td>
                <td data-label="สถานะ" style="text-align: center;">
                    <span style="background: #fef3c7; color: #b45309; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700;">
                        ⏸️ ${s.status}
                    </span>
                </td>
                <td data-label="หมายเหตุ" style="text-align: center; color: #64748b;">${s.note || '-'}</td>
            </tr>
        `;
    });

    listBody.innerHTML = html;
};

// 3. ฟังก์ชันอัปเดตตัวเลขการ์ด KPI สรุปภาพรวม
function updateSuspendedKPICards(data) {
    let total = data.length;
    let male = 0, female = 0;

    data.forEach(s => {
        const gender = (s.gender || '').trim();
        if (gender === 'ชาย' || gender === 'นาย') male++;
        else female++;
    });

    if (document.getElementById('suspendedKpiTotal')) document.getElementById('suspendedKpiTotal').textContent = total.toLocaleString();
    if (document.getElementById('suspendedKpiMale')) document.getElementById('suspendedKpiMale').textContent = male.toLocaleString();
    if (document.getElementById('suspendedKpiFemale')) document.getElementById('suspendedKpiFemale').textContent = female.toLocaleString();
}

// 4. ฟังก์ชันวาดตารางสรุปรายชั้น (ม.1 - ม.6)
function renderSuspendedGradeSummaryTable(data) {
    const summaryBody = document.getElementById('suspendedGradeSummaryBody');
    if (!summaryBody) return;

    const grades = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    let html = '';
    let grandMale = 0, grandFemale = 0, grandTotal = 0;

    grades.forEach(g => {
        const gradeStudents = data.filter(s => s.grade_level === g);
        let male = 0, female = 0;

        gradeStudents.forEach(s => {
            const gender = (s.gender || '').trim();
            if (gender === 'ชาย' || gender === 'นาย') male++;
            else female++;
        });

        const totalGrade = male + female;
        grandMale += male;
        grandFemale += female;
        grandTotal += totalGrade;

        html += `
            <tr>
                <td data-label="ระดับชั้น" style="text-align: center; font-weight: 700; color: #b45309;">${g}</td>
                <td data-label="ชาย" style="text-align: center; color: #2563eb;">${male}</td>
                <td data-label="หญิง" style="text-align: center; color: #db2777;">${female}</td>
                <td data-label="รวมทั้งหมด" style="text-align: center; font-weight: 700; background: #fffbeb; color: #d97706;">${totalGrade}</td>
            </tr>
        `;
    });

    html += `
        <tr style="background: #fef3c7; font-weight: 700; border-top: 2px solid #fde68a;">
            <td data-label="ระดับชั้น" style="text-align: center; color: #b45309;">รวมทุกระดับชั้น</td>
            <td data-label="ชาย" style="text-align: center; color: #1d4ed8;">${grandMale}</td>
            <td data-label="หญิง" style="text-align: center; color: #be185d;">${grandFemale}</td>
            <td data-label="รวมทั้งหมด" style="text-align: center; color: #b45309; font-size: 15px;">${grandTotal} คน</td>
        </tr>
    `;

    summaryBody.innerHTML = html;
}