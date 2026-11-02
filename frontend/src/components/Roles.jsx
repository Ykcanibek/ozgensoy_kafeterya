import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from './ui/ToastProvider';
import { useConfirm } from './ui/ConfirmProvider';
import axios from 'axios';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import './roles.css';
import {
  ShieldCheck,
  Plus,
  RefreshCw,
  Users,
  Lock,
  Trash2,
  Edit3,
  Check,
  X,
  AlertTriangle,
  LayoutGrid,
  CreditCard,
  Tags,
  Package,
  ChefHat,
  BarChart3,
  UserCheck,
  CheckCircle2,
  Armchair,
  BookOpen,
  Copy,
  Search,
  Percent,
  CornerDownRight,
  Info
} from 'lucide-react';

const COLOR_PALETTE = [
  { name: 'Altın / Kehribar', color: '#b45309' },
  { name: 'Gök Mavisi', color: '#0284c7' },
  { name: 'Zümrüt Yeşili', color: '#059669' },
  { name: 'Turuncu / Mutfak', color: '#ea580c' },
  { name: 'Mor / Ametist', color: '#7e22ce' },
  { name: 'Gül / Kırmızı', color: '#e11d48' },
  { name: 'Arduvaz Mavisi', color: '#346c80' }
];

const MODULE_ICONS = { LayoutGrid, Armchair, CreditCard, BookOpen, Users, Tags, Package, Trash2, ChefHat, BarChart3, UserCheck, ShieldCheck };

const ACTION_BADGES = {
  view: { cls: 'view', label: 'Görüntüleme' },
  create: { cls: 'create', label: 'Ekleme / İşlem' },
  edit: { cls: 'edit', label: 'Düzenleme' },
  delete: { cls: 'delete', label: 'Silme / İptal' },
  special: { cls: 'special', label: 'Özel İşlem' }
};

const EMPTY_FORM = { name: '', description: '', color: '#346c80', permissions: [], maxDiscount: '' };

export default function Roles() {
  const { can } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [catalogPermissions, setCatalogPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Düzenleme / Ekleme Modalı
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [editingRole, setEditingRole] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState(EMPTY_FORM);
  const [permSearch, setPermSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Silme Modalı
  const [deleteModalRole, setDeleteModalRole] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const permByKey = useMemo(
    () => new Map(catalogPermissions.map(p => [p.key, p])),
    [catalogPermissions]
  );

  const isAdminRoleLocked = modalMode === 'edit' && editingRole?.is_locked;
  const isLocked = isAdminRoleLocked || (modalMode === 'edit' && !can('roles.edit'));
  const selectedPerms = form.permissions;
  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const fetchRolesData = async () => {
    try {
      setLoading(true);
      const [rolesRes, catalogRes] = await Promise.all([
        axios.get('/api/roles'),
        axios.get('/api/roles/permissions-catalog')
      ]);

      if (rolesRes.data.success) {
        setRoles(rolesRes.data.roles);
      }
      if (catalogRes.data.success) {
        setModules(catalogRes.data.modules);
        setCatalogPermissions(catalogRes.data.permissions);
      }
    } catch (error) {
      console.error('Veriler yüklenirken hata:', error);
      showToast('Yetkiler yüklenirken bağlantı hatası oluştu.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRolesData();
  }, []);

  const { showToast } = useToast(); // Global bildirimler (üst ortada, türe göre)
  const confirm = useConfirm(); // Uygulama tasarımında onay penceresi

  const openModal = (mode, role, values) => {
    setModalMode(mode);
    setEditingRole(role);
    setForm(values);
    setInitialForm(values);
    setPermSearch('');
  };

  // Yeni Rol Ekleme Modalını Aç (Varsayılan: sadece salon ekranını görme)
  const handleOpenAddModal = () => {
    openModal('add', null, { ...EMPTY_FORM, permissions: ['pos.view'] });
  };

  const fetchRolePermissions = async (role) => {
    const res = await axios.get(`/api/roles/${role.id}`);
    return res.data.success ? res.data.role.permissions || [] : [];
  };

  // Rol Düzenleme Modalını Aç
  const handleOpenEditModal = async (role) => {
    try {
      const permissions = await fetchRolePermissions(role);
      openModal('edit', role, {
        name: role.name,
        description: role.description || '',
        color: role.color || '#346c80',
        permissions,
        maxDiscount: role.max_discount_percent ?? ''
      });
    } catch (error) {
      console.error('Rol izinleri alınamadı:', error);
      showToast('Rol izinleri yüklenemedi.', 'error');
    }
  };

  // Mevcut bir rolü şablon olarak kullanıp yeni rol oluştur
  const handleDuplicateRole = async (role) => {
    try {
      const permissions = await fetchRolePermissions(role);
      openModal('add', null, {
        name: `${role.name} (Kopya)`,
        description: role.description || '',
        color: role.color || '#346c80',
        permissions,
        maxDiscount: role.max_discount_percent ?? ''
      });
    } catch (error) {
      console.error('Rol kopyalanamadı:', error);
      showToast('Rol kopyalanamadı.', 'error');
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!modalMode) return false;
    const a = { ...form, permissions: [...form.permissions].sort() };
    const b = { ...initialForm, permissions: [...initialForm.permissions].sort() };
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [form, initialForm, modalMode]);

  const handleCloseModal = async () => {
    if (isSubmitting) return;
    if (hasUnsavedChanges && !(await confirm({
      title: 'Değişiklikler kaydedilmedi',
      message: 'Kaydedilmemiş değişiklikler var. Çıkarsanız bu değişiklikler kaybolacak.',
      confirmLabel: 'Kaydetmeden çık',
      cancelLabel: 'Düzenlemeye dön',
      danger: true
    }))) {
      return;
    }
    setModalMode(null);
  };

  // Bir yetkiyi, ön koşullarıyla (requires) birlikte ekle
  const withRequirements = (keys) => {
    const result = new Set();
    const visit = (key) => {
      if (result.has(key) || !permByKey.has(key)) return;
      result.add(key);
      permByKey.get(key).requires.forEach(visit);
    };
    keys.forEach(visit);
    return result;
  };

  // Bir yetki kaldırıldığında ona bağlı (onu gerektiren) yetkileri de kaldır
  const withoutDependents = (current, removedKeys) => {
    const remaining = new Set(current);
    const queue = [...removedKeys];
    while (queue.length) {
      const key = queue.shift();
      if (!remaining.delete(key)) continue;
      for (const p of catalogPermissions) {
        if (remaining.has(p.key) && p.requires.includes(key)) queue.push(p.key);
      }
    }
    return remaining;
  };

  const labelsOf = (keys) => keys.map(k => permByKey.get(k)?.label || k).join(', ');

  const applyPermissions = (next) => {
    const prev = new Set(selectedPerms);
    const nextArr = [...next];
    const autoAdded = nextArr.filter(k => !prev.has(k));
    const autoRemoved = [...prev].filter(k => !next.has(k));
    setField('permissions', nextArr);
    return { autoAdded, autoRemoved };
  };

  // Tekil İzin Aç / Kapat
  const togglePermission = (permKey) => {
    if (isLocked) return;
    if (selectedPerms.includes(permKey)) {
      const { autoRemoved } = applyPermissions(withoutDependents(selectedPerms, [permKey]));
      const extra = autoRemoved.filter(k => k !== permKey);
      if (extra.length) showToast(`Bağlı yetkiler de kaldırıldı: ${labelsOf(extra)}`, 'info');
    } else {
      const { autoAdded } = applyPermissions(withRequirements([...selectedPerms, permKey]));
      const extra = autoAdded.filter(k => k !== permKey);
      if (extra.length) showToast(`Gerekli yetkiler de eklendi: ${labelsOf(extra)}`, 'info');
    }
  };

  // Bir Modüldeki Tüm İzinleri Aç / Kapat
  const toggleModulePermissions = (moduleId) => {
    if (isLocked) return;
    const moduleKeys = catalogPermissions.filter(p => p.category === moduleId).map(p => p.key);
    const allSelected = moduleKeys.every(k => selectedPerms.includes(k));
    applyPermissions(allSelected
      ? withoutDependents(selectedPerms, moduleKeys)
      : withRequirements([...selectedPerms, ...moduleKeys]));
  };

  // Hızlı seçimler
  const handleSelectAllPermissions = () => !isLocked && setField('permissions', catalogPermissions.map(p => p.key));
  const handleClearAllPermissions = () => !isLocked && setField('permissions', []);
  const handleSelectViewOnly = () => {
    if (isLocked) return;
    applyPermissions(withRequirements(catalogPermissions.filter(p => p.action === 'view').map(p => p.key)));
  };

  // Form Kaydet
  const handleSubmitRole = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('Lütfen bir rol adı giriniz.', 'error');
      return;
    }
    if (form.maxDiscount !== '' && (Number(form.maxDiscount) < 0 || Number(form.maxDiscount) > 100)) {
      showToast('İndirim üst sınırı 0 ile 100 arasında olmalıdır.', 'error');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description,
      color: form.color,
      permissions: form.permissions,
      max_discount_percent: form.maxDiscount === '' ? null : Number(form.maxDiscount)
    };

    try {
      setIsSubmitting(true);
      const res = modalMode === 'add'
        ? await axios.post('/api/roles', payload)
        : await axios.put(`/api/roles/${editingRole.id}`, payload);
      if (res.data.success) {
        showToast(res.data.message || 'Rol kaydedildi.');
        setModalMode(null);
        fetchRolesData();
      }
    } catch (error) {
      console.error('Rol kaydetme hatası:', error);
      const msg = error.response?.data?.message || 'Rol kaydedilirken bir hata oluştu.';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Rol Sil
  const handleConfirmDeleteRole = async () => {
    if (!deleteModalRole) return;
    try {
      setIsDeleting(true);
      const res = await axios.delete(`/api/roles/${deleteModalRole.id}`);
      if (res.data.success) {
        showToast('Rol başarıyla silindi.');
        setDeleteModalRole(null);
        fetchRolesData();
      }
    } catch (error) {
      console.error('Rol silme hatası:', error);
      const msg = error.response?.data?.message || 'Rol silinemedi.';
      showToast(msg, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderModuleIcon = (iconName) => {
    const Icon = MODULE_ICONS[iconName] || ShieldCheck;
    return <Icon size={16} />;
  };

  const renderActionBadge = (action) => {
    const badge = ACTION_BADGES[action];
    return badge ? <span className={`role-perm-action-badge ${badge.cls}`}>{badge.label}</span> : null;
  };

  // Arama filtresi (yetki adı, açıklaması veya modül adı)
  const searchTerm = permSearch.trim().toLocaleLowerCase('tr-TR');
  const matchesSearch = (perm, mod) => !searchTerm || [perm.label, perm.description, mod.name]
    .some(t => t?.toLocaleLowerCase('tr-TR').includes(searchTerm));

  const highRiskSelected = selectedPerms.filter(k => permByKey.get(k)?.risk === 'high').length;
  const hasDiscountPerm = selectedPerms.includes('payment.discount');

  return (
    <div className="pos-page-container">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activePage="roles"
      />

      {/* Üst Bar */}
      <Navbar
        onOpenSidebar={() => setIsSidebarOpen(true)}
        title="Yetki & Rol Yönetimi"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {can('roles.create') && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="pos-edit-btn"
              style={{
                background: '#173845',
                borderColor: '#173845',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 700
              }}
              title="Yeni Yetki Rolü Tanımla"
            >
              <Plus size={16} />
              <span>Yeni Rol Ekle</span>
            </button>
            )}
            <button
              type="button"
              onClick={fetchRolesData}
              className="pos-edit-btn"
              style={{
                background: '#dbe9ee',
                border: '1px solid #b6ced6',
                color: '#1b414f',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title="Yenile"
            >
              <RefreshCw size={15} className={loading ? 'cat-spin' : ''} />
              <span>Yenile</span>
            </button>
          </div>
        }
      />

      {/* TOAST BİLDİRİMİ */}

      <div className="roles-container">
        {/* ROL KARTLARI */}
        <div className="roles-cards-grid">
          {roles.map((role) => (
            <div key={role.id} className="role-card">
              <div
                className="role-card-top-accent"
                style={{ background: role.color || '#346c80' }}
              ></div>

              <div>
                <div className="role-card-header">
                  <div
                    className="role-card-icon-box"
                    style={{ background: role.color || '#346c80' }}
                  >
                    {role.is_locked ? <Lock size={18} /> : (role.name?.slice(0, 1)?.toLocaleUpperCase('tr-TR') || 'R')}
                  </div>
                  <span className={`role-badge-tag ${role.is_locked ? 'locked' : role.is_system ? 'system' : 'custom'}`}>
                    {role.is_locked ? 'Tam Yetki · Kilitli' : role.is_system ? 'Sistem Rolü' : 'Özel Rol'}
                  </span>
                </div>

                <div className="role-card-body">
                  <h3 className="role-card-title">{role.name}</h3>
                  <span className="role-card-slug">@{role.slug}</span>
                  <p className="role-card-desc">{role.description || 'Açıklama belirtilmemiş.'}</p>
                  {role.max_discount_percent !== null && (
                    <span className="role-card-limit">
                      <Percent size={12} /> En fazla %{role.max_discount_percent} indirim
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="role-card-meta-row">
                  <div className="role-meta-item">
                    <ShieldCheck size={16} color="#0369a1" />
                    <span><strong>{role.permissions_count}</strong> / {catalogPermissions.length} Yetki</span>
                  </div>
                  <div className="role-meta-item" title={role.user_names?.join(', ') || 'Bu role atanmış personel yok'}>
                    <Users size={16} color="#059669" />
                    <span><strong>{role.users_count}</strong> Personel</span>
                  </div>
                </div>

                <div className="role-card-actions">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(role)}
                    className="role-btn-primary"
                  >
                    <Edit3 size={15} />
                    <span>{role.is_locked || !can('roles.edit') ? 'Rolü İncele' : 'Yetkileri Düzenle'}</span>
                  </button>

                  {can('roles.create') && (
                  <button
                    type="button"
                    onClick={() => handleDuplicateRole(role)}
                    className="role-btn-icon-copy"
                    title="Bu rolü şablon alarak yeni rol oluştur"
                  >
                    <Copy size={16} />
                  </button>
                  )}

                  {!role.is_system && can('roles.delete') && (
                    <button
                      type="button"
                      onClick={() => setDeleteModalRole(role)}
                      className="role-btn-icon-del"
                      title="Rolü Sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ======================================================== */}
      {/* DETAYLI YETKİ MATRİSİ VE ROL DÜZENLEME MODALI            */}
      {/* ======================================================== */}
      {modalMode && (
        <div className="roles-modal-backdrop" onClick={handleCloseModal}>
          <div className="roles-modal-box" onClick={(e) => e.stopPropagation()}>
            {/* Modal Başlığı */}
            <div className="roles-modal-header">
              <div className="roles-modal-header-left">
                <ShieldCheck size={22} color="#38bdf8" />
                <div>
                  <h3 className="roles-modal-title">
                    {modalMode === 'add' ? 'Yeni Yetki Rolü Oluştur' : `${editingRole?.name} - Yetki Matrisi`}
                  </h3>
                  <p className="roles-modal-subtitle">
                    {modalMode === 'edit'
                      ? `Rol kodu: @${editingRole?.slug}`
                      : 'Personelin hangi ekranları görüp hangi işlemleri yapabileceğini belirleyin'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="roles-modal-close-btn"
                disabled={isSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Gövdesi */}
            <form onSubmit={handleSubmitRole} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="roles-modal-body">
                {/* 1. Temel Rol Bilgileri Formu */}
                <div className="role-form-grid">
                  <div className="role-form-group">
                    <label className="role-form-label">Rol Adı *</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      placeholder="Örn: Kıdemli Kasa Sorumlusu"
                      value={form.name}
                      onChange={(e) => setField('name', e.target.value)}
                      className="role-form-input"
                    />
                  </div>

                  <div className="role-form-group">
                    <label className="role-form-label">Rol Rengi</label>
                    <div className="role-color-picker">
                      {COLOR_PALETTE.map((pal) => (
                        <div
                          key={pal.color}
                          className={`role-color-dot ${form.color === pal.color ? 'active' : ''}`}
                          style={{ background: pal.color }}
                          onClick={() => setField('color', pal.color)}
                          title={pal.name}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="role-form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="role-form-label">Açıklama / Görev Tanımı</label>
                    <input
                      type="text"
                      placeholder="Bu role sahip personellerin temel sorumluluklarını belirtin"
                      value={form.description}
                      onChange={(e) => setField('description', e.target.value)}
                      className="role-form-input"
                    />
                  </div>
                </div>

                {isLocked && !isAdminRoleLocked && (
                  <div className="roles-lock-banner">
                    <Lock size={18} />
                    <div>
                      <strong>Salt okunur görünüm</strong>
                      <span>Rol yetkilerini değiştirme yetkiniz yok; bu rolü yalnızca inceleyebilirsiniz.</span>
                    </div>
                  </div>
                )}

                {isAdminRoleLocked && (
                  <div className="roles-lock-banner">
                    <Lock size={18} />
                    <div>
                      <strong>Bu rolün yetkileri kilitlidir.</strong>
                      <span>İşletme sahibinin sistemden kilitlenmemesi için yönetici rolü her zaman tüm yetkilere sahiptir. Yalnızca adını, rengini ve açıklamasını değiştirebilirsiniz.</span>
                    </div>
                  </div>
                )}

                {/* 2. İzin Matrisi Üst Çubuğu */}
                <div className="roles-matrix-toolbar">
                  <div className="roles-matrix-counter">
                    <span>Seçilen İzinler:</span>
                    <strong style={{ color: '#047857' }}>
                      {selectedPerms.length} / {catalogPermissions.length} Yetki
                    </strong>
                    {highRiskSelected > 0 && (
                      <span className="roles-risk-counter" title="Kayıp-kaçak riski taşıyan kritik işlemler">
                        <AlertTriangle size={13} /> {highRiskSelected} kritik
                      </span>
                    )}
                  </div>

                  <div className="roles-search-box">
                    <Search size={15} />
                    <input
                      type="text"
                      placeholder="Yetki ara (ör. indirim, iptal, fiyat)"
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                    />
                    {permSearch && (
                      <button type="button" onClick={() => setPermSearch('')} title="Aramayı temizle">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {!isLocked && (
                    <div className="roles-matrix-quick-btns">
                      <button type="button" onClick={handleSelectViewOnly} className="roles-quick-btn" title="Yalnızca görüntüleme yetkilerini seçer">
                        Salt Okunur
                      </button>
                      <button type="button" onClick={handleSelectAllPermissions} className="roles-quick-btn">
                        Tam Yetki
                      </button>
                      <button type="button" onClick={handleClearAllPermissions} className="roles-quick-btn">
                        Temizle
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Modül Bazında İzin Matrisi Kartları */}
                <div className="roles-modules-list">
                  {modules.map((mod) => {
                    const modulePerms = catalogPermissions.filter(p => p.category === mod.id);
                    const visiblePerms = modulePerms.filter(p => matchesSearch(p, mod));
                    if (visiblePerms.length === 0) return null;
                    const allSelected = modulePerms.every(p => selectedPerms.includes(p.key));
                    const selectedInModule = modulePerms.filter(p => selectedPerms.includes(p.key)).length;

                    return (
                      <div key={mod.id} className="role-module-card">
                        <div className="role-module-header">
                          <div className="role-module-title-box">
                            <div className="role-module-icon">
                              {renderModuleIcon(mod.icon)}
                            </div>
                            <div>
                              <div className="role-module-name">{mod.name}</div>
                              <div className="role-module-desc">{mod.description}</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#64748b' }}>
                              {selectedInModule} / {modulePerms.length}
                            </span>
                            {!isLocked && (
                              <button
                                type="button"
                                onClick={() => toggleModulePermissions(mod.id)}
                                className="role-module-toggle-all"
                              >
                                {allSelected ? 'Modülü Kaldır' : 'Tüm Modülü Seç'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Modül İzinleri */}
                        <div className="role-permissions-grid">
                          {visiblePerms.map((perm) => {
                            const isChecked = selectedPerms.includes(perm.key);
                            const requiresOther = perm.requires.filter(r => permByKey.get(r)?.category !== perm.category);
                            return (
                              <div
                                key={perm.key}
                                className={`role-perm-item ${isChecked ? 'checked' : ''} ${isLocked ? 'locked' : ''}`}
                                onClick={() => togglePermission(perm.key)}
                                title={perm.description}
                              >
                                <div className="role-perm-checkbox">
                                  {isChecked && <Check size={13} strokeWidth={3} />}
                                </div>
                                <div className="role-perm-content">
                                  <div className="role-perm-badges">
                                    {renderActionBadge(perm.action)}
                                    {perm.risk === 'high' && (
                                      <span className="role-perm-risk-badge">
                                        <AlertTriangle size={10} /> Kritik
                                      </span>
                                    )}
                                  </div>
                                  <span className="role-perm-label">{perm.label}</span>
                                  <span className="role-perm-desc">{perm.description}</span>
                                  {requiresOther.length > 0 && (
                                    <span className="role-perm-requires">
                                      <CornerDownRight size={11} /> Gerektirir: {labelsOf(requiresOther)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Kasa modülünde indirim yetkisi seçiliyse: indirim üst sınırı */}
                        {mod.id === 'payment' && hasDiscountPerm && !isLocked && (
                          <div className="role-limit-box">
                            <div className="role-limit-text">
                              <Percent size={16} />
                              <div>
                                <strong>İndirim üst sınırı</strong>
                                <span>Bu roldeki personel adisyon tutarının en fazla yüzde kaçı kadar indirim yapabilir? Boş bırakılırsa sınırsızdır.</span>
                              </div>
                            </div>
                            <div className="role-limit-input">
                              <span>%</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                placeholder="Sınırsız"
                                value={form.maxDiscount}
                                onChange={(e) => setField('maxDiscount', e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {searchTerm && !modules.some(mod => catalogPermissions.some(p => p.category === mod.id && matchesSearch(p, mod))) && (
                    <div className="roles-search-empty">“{permSearch}” ile eşleşen yetki bulunamadı.</div>
                  )}
                </div>
              </div>

              {/* Modal Alt Çubuğu */}
              <div className="roles-modal-footer">
                {hasUnsavedChanges && <span className="roles-unsaved-hint">Kaydedilmemiş değişiklikler var</span>}
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="roles-btn-cancel"
                  disabled={isSubmitting}
                >
                  Vazgeç
                </button>
                {!(isLocked && !isAdminRoleLocked) && (
                <button
                  type="submit"
                  className="roles-btn-save"
                  disabled={isSubmitting || (modalMode === 'edit' && !hasUnsavedChanges)}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="cat-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{modalMode === 'add' ? 'Rolü Oluştur' : isLocked ? 'Bilgileri Güncelle' : 'Yetkileri Güncelle'}</span>
                    </>
                  )}
                </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ROL SİLME ONAY MODALI                                    */}
      {/* ======================================================== */}
      {deleteModalRole && (
        <div className="roles-modal-backdrop" onClick={() => !isDeleting && setDeleteModalRole(null)}>
          <div className="roles-delete-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="roles-delete-icon-box">
              <Trash2 size={28} />
            </div>
            {deleteModalRole.users_count > 0 ? (
              <>
                <h3 className="roles-delete-title">Bu Rol Şu An Kullanımda</h3>
                <p className="roles-delete-desc">
                  <strong>"{deleteModalRole.name}"</strong> rolüne atanmış {deleteModalRole.users_count} personel var:
                  {' '}<strong>{deleteModalRole.user_names.join(', ')}</strong>. Rolü silmeden önce bu personellere başka bir rol atayın.
                </p>
                <div className="roles-delete-actions">
                  <button type="button" onClick={() => setDeleteModalRole(null)} className="roles-btn-cancel">
                    Tamam
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="roles-delete-title">Rolü Silmek İstediğinize Emin Misiniz?</h3>
                <p className="roles-delete-desc">
                  <strong>"{deleteModalRole.name}"</strong> adlı yetki rolü kalıcı olarak silinecektir. Bu işlem geri alınamaz.
                </p>
                <div className="roles-delete-actions">
                  <button
                    type="button"
                    onClick={() => setDeleteModalRole(null)}
                    className="roles-btn-cancel"
                    disabled={isDeleting}
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteRole}
                    className="roles-btn-delete-confirm"
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Siliniyor...' : 'Evet, Rolü Sil'}
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
