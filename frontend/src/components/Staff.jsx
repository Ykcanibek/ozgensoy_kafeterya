import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import axios from 'axios';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { toTitleCaseTr, formatLeadingZeroPhone } from './Customers';
import './roles.css';
import './staff.css';
import {
  UserCheck,
  UserPlus,
  UserX,
  Users,
  RefreshCw,
  Search,
  Edit3,
  KeyRound,
  Trash2,
  Power,
  Check,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldCheck,
  Phone,
  Clock
} from 'lucide-react';

const MIN_PASSWORD_LENGTH = 6;

const EMPTY_FORM = { name: '', username: '', phone: '0', role_id: '', is_active: true, password: '', passwordConfirm: '' };

// Ad soyaddan kullanıcı adı önerisi: "Ayşe Yılmaz" -> "ayse.yilmaz"
const suggestUsername = (name) => name
  .trim()
  .toLocaleLowerCase('tr-TR')
  .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
  .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9\s]/g, '')
  .split(/\s+/)
  .filter(Boolean)
  .join('.')
  .slice(0, 30);

const formatPhone = (p) => {
  if (!p) return null;
  const d = String(p);
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}` : d;
};

// "3 dk önce", "2 gün önce" gibi göreli zaman
const timeAgo = (dateStr) => {
  if (!dateStr) return null;
  const diff = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

const initials = (name) => name
  .split(/\s+/)
  .filter(w => /^\p{L}/u.test(w))
  .slice(0, 2)
  .map(w => w[0].toLocaleUpperCase('tr-TR'))
  .join('') || '?';

export default function Staff() {
  const { user: currentUser, can } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtreler
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Ekleme / düzenleme modalı
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Şifre sıfırlama ve silme modalları
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBlocked, setDeleteBlocked] = useState(null);

  const { showToast } = useToast(); // Global bildirimler (üst ortada, türe göre)
  const confirm = useConfirm(); // Uygulama tasarımında onay penceresi

  const apiError = (error, fallback) => error.response?.data?.message || fallback;

  const fetchData = async () => {
    try {
      setLoading(true);
      const [staffRes, rolesRes] = await Promise.all([axios.get('/api/staff'), axios.get('/api/roles')]);
      if (staffRes.data.success) setStaff(staffRes.data.staff);
      if (rolesRes.data.success) setRoles(rolesRes.data.roles);
    } catch (error) {
      console.error('Personel verileri yüklenemedi:', error);
      showToast('Personel listesi yüklenirken bağlantı hatası oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => ({
    total: staff.length,
    active: staff.filter(s => s.is_active).length,
    passive: staff.filter(s => !s.is_active).length
  }), [staff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return staff.filter(s => {
      if (roleFilter !== 'all' && String(s.role_id) !== roleFilter) return false;
      if (statusFilter === 'active' && !s.is_active) return false;
      if (statusFilter === 'passive' && s.is_active) return false;
      if (!q) return true;
      return [s.name, s.username, s.phone, s.role_name].some(v => v?.toLocaleLowerCase('tr-TR').includes(q));
    });
  }, [staff, search, roleFilter, statusFilter]);

  const selectedRole = roles.find(r => String(r.id) === String(form.role_id));
  const isSelfEditing = modalMode === 'edit' && editing?.id === currentUser?.id;
  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // ---- Ekle / Düzenle ----
  const openAddModal = () => {
    const defaultRole = roles.find(r => r.slug === 'waiter') || roles.find(r => !r.is_locked);
    setForm({ ...EMPTY_FORM, role_id: defaultRole ? String(defaultRole.id) : '' });
    setEditing(null);
    setUsernameTouched(false);
    setShowPassword(false);
    setModalMode('add');
  };

  const openEditModal = (member) => {
    setForm({
      name: member.name,
      username: member.username,
      phone: member.phone || '0',
      role_id: member.role_id ? String(member.role_id) : '',
      is_active: member.is_active,
      password: '',
      passwordConfirm: ''
    });
    setEditing(member);
    setUsernameTouched(true);
    setModalMode('edit');
  };

  const handleNameChange = (value) => {
    setField('name', value);
    if (modalMode === 'add' && !usernameTouched) setField('username', suggestUsername(value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return showToast('Ad soyad zorunludur.', 'error');
    if (!form.role_id) return showToast('Lütfen bir rol seçin.', 'error');
    if (modalMode === 'add') {
      if (form.password.length < MIN_PASSWORD_LENGTH) return showToast(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`, 'error');
      if (form.password !== form.passwordConfirm) return showToast('Şifreler birbiriyle eşleşmiyor.', 'error');
    }

    const payload = {
      name: toTitleCaseTr(form.name.trim()),
      username: form.username,
      phone: form.phone,
      role_id: Number(form.role_id),
      is_active: form.is_active,
      ...(modalMode === 'add' ? { password: form.password } : {})
    };

    try {
      setIsSubmitting(true);
      const res = modalMode === 'add'
        ? await axios.post('/api/staff', payload)
        : await axios.put(`/api/staff/${editing.id}`, payload);
      showToast(res.data.message);
      setModalMode(null);
      fetchData();
    } catch (error) {
      showToast(apiError(error, 'Personel kaydedilemedi.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Aktif / Pasif ----
  const handleToggleStatus = async (member) => {
    if (member.is_active && !(await confirm({
      title: `${member.name} pasife alınsın mı?`,
      message: 'Bu personel artık sisteme giriş yapamaz. Geçmiş kayıtları korunur; dilediğiniz zaman tekrar aktif edebilirsiniz.',
      confirmLabel: 'Pasife al',
      danger: true
    }))) return;
    try {
      const res = await axios.patch(`/api/staff/${member.id}/status`);
      showToast(res.data.message);
      setDeleteTarget(null);
      setDeleteBlocked(null);
      fetchData();
    } catch (error) {
      showToast(apiError(error, 'Durum değiştirilemedi.'), 'error');
    }
  };

  // ---- Şifre Sıfırlama ----
  const openPasswordModal = (member) => {
    setPasswordTarget(member);
    setNewPassword('');
    setNewPasswordConfirm('');
    setShowPassword(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) return showToast(`Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`, 'error');
    if (newPassword !== newPasswordConfirm) return showToast('Şifreler birbiriyle eşleşmiyor.', 'error');
    try {
      setIsSubmitting(true);
      const res = await axios.put(`/api/staff/${passwordTarget.id}/password`, { password: newPassword });
      showToast(res.data.message);
      setPasswordTarget(null);
    } catch (error) {
      showToast(apiError(error, 'Şifre değiştirilemedi.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Silme ----
  const handleDelete = async () => {
    try {
      setIsSubmitting(true);
      const res = await axios.delete(`/api/staff/${deleteTarget.id}`);
      showToast(res.data.message);
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      if (error.response?.data?.hasHistory) {
        setDeleteBlocked(error.response.data.message);
      } else {
        showToast(apiError(error, 'Personel silinemedi.'), 'error');
        setDeleteTarget(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordStrength = (pw) => {
    if (!pw) return null;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-ZĞÜŞİÖÇ]/.test(pw) && /[a-zğüşıöç]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9ğüşıöçĞÜŞİÖÇ]/.test(pw)) score++;
    if (pw.length < MIN_PASSWORD_LENGTH) return { level: 'weak', label: 'Çok kısa' };
    return score >= 3 ? { level: 'strong', label: 'Güçlü' } : score >= 2 ? { level: 'medium', label: 'Orta' } : { level: 'weak', label: 'Zayıf' };
  };

  const renderPasswordFields = (value, setValue, confirm, setConfirm) => {
    const strength = passwordStrength(value);
    return (
      <>
        <div className="role-form-group">
          <label className="role-form-label">Şifre *</label>
          <div className="staff-password-input">
            <input
              type={showPassword ? 'text' : 'password'}
              className="role-form-input"
              placeholder={`En az ${MIN_PASSWORD_LENGTH} karakter`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="new-password"
            />
            <button type="button" onClick={() => setShowPassword(v => !v)} title={showPassword ? 'Gizle' : 'Göster'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {strength && <span className={`staff-pw-strength ${strength.level}`}>Şifre gücü: {strength.label}</span>}
        </div>
        <div className="role-form-group">
          <label className="role-form-label">Şifre Tekrar *</label>
          <input
            type={showPassword ? 'text' : 'password'}
            className="role-form-input"
            placeholder="Şifreyi tekrar girin"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {confirm && confirm !== value && <span className="staff-pw-strength weak">Şifreler eşleşmiyor</span>}
        </div>
      </>
    );
  };

  return (
    <div className="pos-page-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Personel Yönetimi"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {can('staff.create') && (
            <button
              type="button"
              onClick={openAddModal}
              className="pos-edit-btn"
              style={{ background: '#173845', borderColor: '#173845', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
            >
              <UserPlus size={16} />
              <span>Yeni Personel</span>
            </button>
            )}
            <button
              type="button"
              onClick={fetchData}
              className="pos-edit-btn"
              style={{ background: '#dbe9ee', border: '1px solid #b6ced6', color: '#1b414f', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Yenile"
            >
              <RefreshCw size={15} className={loading ? 'cat-spin' : ''} />
              <span>Yenile</span>
            </button>
          </div>
        }
      />


      <div className="roles-container">
        {/* İstatistikler */}
        <div className="roles-stats-grid staff-stats-grid">
          <div className="roles-stat-card">
            <div className="roles-stat-icon primary"><Users size={22} /></div>
            <div className="roles-stat-info">
              <span className="roles-stat-label">Toplam Personel</span>
              <span className="roles-stat-val">{stats.total}</span>
            </div>
          </div>
          <div className="roles-stat-card">
            <div className="roles-stat-icon green"><UserCheck size={22} /></div>
            <div className="roles-stat-info">
              <span className="roles-stat-label">Aktif Hesap</span>
              <span className="roles-stat-val">{stats.active}</span>
            </div>
          </div>
          <div className="roles-stat-card">
            <div className="roles-stat-icon gold"><UserX size={22} /></div>
            <div className="roles-stat-info">
              <span className="roles-stat-label">Pasif Hesap</span>
              <span className="roles-stat-val">{stats.passive}</span>
            </div>
          </div>
          <div className="roles-stat-card">
            <div className="roles-stat-icon purple"><ShieldCheck size={22} /></div>
            <div className="roles-stat-info">
              <span className="roles-stat-label">Tanımlı Rol</span>
              <span className="roles-stat-val">{roles.length}</span>
            </div>
          </div>
        </div>

        {/* Filtre çubuğu */}
        <div className="staff-toolbar">
          <div className="roles-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Ad, kullanıcı adı veya telefon ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} title="Aramayı temizle"><X size={14} /></button>
            )}
          </div>
          <select className="role-form-input staff-filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">Tüm Roller</option>
            {roles.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
          </select>
          <div className="staff-status-pills">
            {[['all', 'Tümü'], ['active', 'Aktif'], ['passive', 'Pasif']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                className={`roles-quick-btn ${statusFilter === val ? 'active' : ''}`}
                onClick={() => setStatusFilter(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Personel listesi */}
        <div className="staff-list">
          {filteredStaff.map(member => {
            const isSelf = member.id === currentUser?.id;
            return (
              <div key={member.id} className={`staff-row ${member.is_active ? '' : 'passive'}`}>
                <div className="staff-identity">
                  <div className="staff-avatar" style={{ background: member.role_color || '#346c80' }}>
                    {initials(member.name)}
                  </div>
                  <div className="staff-identity-text">
                    <div className="staff-name">
                      {member.name}
                      {isSelf && <span className="staff-self-badge">Siz</span>}
                    </div>
                    <span className="role-card-slug">@{member.username}</span>
                  </div>
                </div>

                <div className="staff-role">
                  {member.role_name ? (
                    <span
                      className="staff-role-badge"
                      style={{ color: member.role_color, borderColor: member.role_color, background: `${member.role_color}14` }}
                    >
                      {member.role_name}
                    </span>
                  ) : (
                    <span className="staff-role-badge missing">Rol atanmamış</span>
                  )}
                  <span className="staff-meta">{member.permissions_count} yetki</span>
                </div>

                <div className="staff-contact">
                  <span className="staff-meta"><Phone size={13} /> {formatPhone(member.phone) || '—'}</span>
                  <span className="staff-meta" title={member.last_login_at ? new Date(member.last_login_at).toLocaleString('tr-TR') : ''}>
                    <Clock size={13} /> {member.last_login_at ? `Son giriş: ${timeAgo(member.last_login_at)}` : 'Hiç giriş yapmadı'}
                  </span>
                </div>

                <div className="staff-status">
                  <span className={`staff-status-pill ${member.is_active ? 'active' : 'passive'}`}>
                    {member.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                </div>

                <div className="staff-actions">
                  {can('staff.edit') && (
                  <button type="button" className="staff-action-btn" onClick={() => openEditModal(member)} title="Bilgileri düzenle">
                    <Edit3 size={15} />
                  </button>
                  )}
                  {can('staff.edit') && (
                  <button type="button" className="staff-action-btn" onClick={() => openPasswordModal(member)} title="Şifre değiştir">
                    <KeyRound size={15} />
                  </button>
                  )}
                  {can('staff.edit') && (
                  <button
                    type="button"
                    className={`staff-action-btn ${member.is_active ? 'warn' : 'ok'}`}
                    onClick={() => handleToggleStatus(member)}
                    disabled={isSelf}
                    title={isSelf ? 'Kendi hesabınızı pasife alamazsınız' : member.is_active ? 'Pasife al' : 'Aktif et'}
                  >
                    <Power size={15} />
                  </button>
                  )}
                  {can('staff.delete') && (
                  <button
                    type="button"
                    className="staff-action-btn danger"
                    onClick={() => { setDeleteTarget(member); setDeleteBlocked(null); }}
                    disabled={isSelf}
                    title={isSelf ? 'Kendi hesabınızı silemezsiniz' : 'Sil'}
                  >
                    <Trash2 size={15} />
                  </button>
                  )}
                </div>
              </div>
            );
          })}

          {!loading && filteredStaff.length === 0 && (
            <div className="roles-search-empty">
              {staff.length === 0 ? 'Henüz personel eklenmemiş.' : 'Filtrelere uyan personel bulunamadı.'}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* PERSONEL EKLEME / DÜZENLEME MODALI                       */}
      {/* ======================================================== */}
      {modalMode && (
        <div className="roles-modal-backdrop" onClick={() => !isSubmitting && setModalMode(null)}>
          <div className="roles-modal-box staff-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="roles-modal-header">
              <div className="roles-modal-header-left">
                <UserCheck size={22} color="#38bdf8" />
                <div>
                  <h3 className="roles-modal-title">{modalMode === 'add' ? 'Yeni Personel Hesabı' : `${editing.name} - Bilgileri Düzenle`}</h3>
                  <p className="roles-modal-subtitle">
                    {modalMode === 'add' ? 'Personelin giriş bilgilerini ve yetki rolünü belirleyin' : 'Şifre değişikliği için listedeki anahtar butonunu kullanın'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setModalMode(null)} className="roles-modal-close-btn" disabled={isSubmitting}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="roles-modal-body">
                <div className="role-form-grid">
                  <div className="role-form-group">
                    <label className="role-form-label">Ad Soyad *</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      className="role-form-input"
                      placeholder="Örn: Ayşe Yılmaz"
                      value={form.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      onBlur={() => setField('name', toTitleCaseTr(form.name.trim()))}
                    />
                  </div>
                  <div className="role-form-group">
                    <label className="role-form-label">Kullanıcı Adı *</label>
                    <input
                      type="text"
                      required
                      maxLength={30}
                      className="role-form-input"
                      placeholder="ayse.yilmaz"
                      value={form.username}
                      onChange={(e) => { setUsernameTouched(true); setField('username', e.target.value.toLowerCase().replace(/\s/g, '')); }}
                      autoComplete="off"
                    />
                    <span className="staff-field-hint">Giriş ekranında kullanılır. Harf, rakam, nokta, tire ve alt çizgi.</span>
                  </div>
                  <div className="role-form-group">
                    <label className="role-form-label">Telefon</label>
                    <input
                      type="tel"
                      className="role-form-input"
                      placeholder="05XX XXX XX XX"
                      value={form.phone}
                      onChange={(e) => setField('phone', formatLeadingZeroPhone(e.target.value))}
                    />
                  </div>
                  <div className="role-form-group">
                    <label className="role-form-label">Yetki Rolü *</label>
                    <select
                      className="role-form-input"
                      value={form.role_id}
                      onChange={(e) => setField('role_id', e.target.value)}
                      disabled={isSelfEditing || (modalMode === 'edit' && !can('staff.assign_role'))}
                      title={isSelfEditing ? 'Kendi rolünüzü değiştiremezsiniz' : (modalMode === 'edit' && !can('staff.assign_role')) ? 'Rol atama yetkiniz yok' : ''}
                    >
                      <option value="" disabled>Rol seçin</option>
                      {roles.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
                    </select>
                    {isSelfEditing && <span className="staff-field-hint">Kendi rolünüzü değiştiremezsiniz.</span>}
                  </div>

                  {selectedRole && (
                    <div className="staff-role-preview" style={{ borderColor: selectedRole.color }}>
                      <ShieldCheck size={18} color={selectedRole.color} />
                      <div>
                        <strong style={{ color: selectedRole.color }}>{selectedRole.name}</strong>
                        <span>{selectedRole.description || 'Açıklama belirtilmemiş.'}</span>
                        <span className="staff-meta">
                          {selectedRole.permissions_count} yetki
                          {selectedRole.max_discount_percent !== null ? ` · En fazla %${selectedRole.max_discount_percent} indirim` : ''}
                          {' · '}Yetkiler "Yetki & Rol Yönetimi" sayfasından düzenlenir.
                        </span>
                      </div>
                    </div>
                  )}

                  {modalMode === 'add' && renderPasswordFields(
                    form.password, (v) => setField('password', v),
                    form.passwordConfirm, (v) => setField('passwordConfirm', v)
                  )}

                  <div className="role-form-group" style={{ gridColumn: '1 / -1' }}>
                    <label
                      className={`staff-active-toggle ${form.is_active ? 'on' : ''} ${isSelfEditing ? 'disabled' : ''}`}
                      title={isSelfEditing ? 'Kendi hesabınızı pasife alamazsınız' : ''}
                    >
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        disabled={isSelfEditing}
                        onChange={(e) => setField('is_active', e.target.checked)}
                      />
                      <span className="staff-toggle-track"><span className="staff-toggle-thumb" /></span>
                      <span>
                        <strong>{form.is_active ? 'Hesap aktif' : 'Hesap pasif'}</strong>
                        <small>{form.is_active ? 'Personel sisteme giriş yapabilir.' : 'Personel giriş yapamaz; geçmiş kayıtları korunur.'}</small>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="roles-modal-footer">
                <button type="button" onClick={() => setModalMode(null)} className="roles-btn-cancel" disabled={isSubmitting}>Vazgeç</button>
                <button type="submit" className="roles-btn-save" disabled={isSubmitting}>
                  {isSubmitting ? <RefreshCw size={16} className="cat-spin" /> : <Check size={16} />}
                  <span>{modalMode === 'add' ? 'Personeli Oluştur' : 'Değişiklikleri Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ŞİFRE DEĞİŞTİRME MODALI                                  */}
      {/* ======================================================== */}
      {passwordTarget && (
        <div className="roles-modal-backdrop" onClick={() => !isSubmitting && setPasswordTarget(null)}>
          <div className="roles-modal-box staff-modal-box small" onClick={(e) => e.stopPropagation()}>
            <div className="roles-modal-header">
              <div className="roles-modal-header-left">
                <KeyRound size={22} color="#38bdf8" />
                <div>
                  <h3 className="roles-modal-title">Şifre Değiştir</h3>
                  <p className="roles-modal-subtitle">{passwordTarget.name} (@{passwordTarget.username})</p>
                </div>
              </div>
              <button type="button" onClick={() => setPasswordTarget(null)} className="roles-modal-close-btn" disabled={isSubmitting}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="roles-modal-body">
                <div className="role-form-grid">
                  {renderPasswordFields(newPassword, setNewPassword, newPasswordConfirm, setNewPasswordConfirm)}
                </div>
              </div>
              <div className="roles-modal-footer">
                <button type="button" onClick={() => setPasswordTarget(null)} className="roles-btn-cancel" disabled={isSubmitting}>Vazgeç</button>
                <button type="submit" className="roles-btn-save" disabled={isSubmitting}>
                  <Check size={16} />
                  <span>Şifreyi Güncelle</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SİLME ONAY MODALI                                        */}
      {/* ======================================================== */}
      {deleteTarget && (
        <div className="roles-modal-backdrop" onClick={() => !isSubmitting && setDeleteTarget(null)}>
          <div className="roles-delete-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="roles-delete-icon-box"><Trash2 size={28} /></div>
            {deleteBlocked ? (
              <>
                <h3 className="roles-delete-title">Bu Personel Silinemez</h3>
                <p className="roles-delete-desc">{deleteBlocked}</p>
                <div className="roles-delete-actions">
                  <button type="button" onClick={() => setDeleteTarget(null)} className="roles-btn-cancel">Vazgeç</button>
                  {deleteTarget.is_active && (
                    <button type="button" onClick={() => handleToggleStatus({ ...deleteTarget, is_active: false })} className="roles-btn-delete-confirm">
                      Pasife Al
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="roles-delete-title">Personeli Silmek İstediğinize Emin Misiniz?</h3>
                <p className="roles-delete-desc">
                  <strong>{deleteTarget.name}</strong> (@{deleteTarget.username}) hesabı kalıcı olarak silinecek. İşlem geçmişi olan personel silinemez; bunun yerine pasife alınabilir.
                </p>
                <div className="roles-delete-actions">
                  <button type="button" onClick={() => setDeleteTarget(null)} className="roles-btn-cancel" disabled={isSubmitting}>Vazgeç</button>
                  <button type="button" onClick={handleDelete} className="roles-btn-delete-confirm" disabled={isSubmitting}>
                    {isSubmitting ? 'Siliniyor...' : 'Evet, Sil'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
