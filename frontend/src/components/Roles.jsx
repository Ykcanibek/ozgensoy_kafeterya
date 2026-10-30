import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
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

export default function Roles() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [catalogPermissions, setCatalogPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);

  // Düzenleme / Ekleme Modalı
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [editingRole, setEditingRole] = useState(null);
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formColor, setFormColor] = useState('#346c80');
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Silme Modalı
  const [deleteModalRole, setDeleteModalRole] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRolesData = async () => {
    try {
      setLoading(true);
      const [rolesRes, catalogRes] = await Promise.all([
        axios.get('http://localhost:5000/api/roles'),
        axios.get('http://localhost:5000/api/roles/permissions-catalog')
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

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  };

  // Yeni Rol Ekleme Modalını Aç
  const handleOpenAddModal = () => {
    setModalMode('add');
    setEditingRole(null);
    setFormName('');
    setFormSlug('');
    setFormDesc('');
    setFormColor('#346c80');
    // Varsayılan olarak temel POS görüntüleme yetkisi ver
    setSelectedPerms(['pos.view']);
  };

  // Rol Düzenleme Modalını Aç
  const handleOpenEditModal = async (role) => {
    try {
      setModalMode('edit');
      setEditingRole(role);
      setFormName(role.name);
      setFormSlug(role.slug);
      setFormDesc(role.description || '');
      setFormColor(role.color || '#346c80');
      setSelectedPerms([]);

      // Tekil rolün güncel izinlerini API'den çek
      const res = await axios.get(`http://localhost:5000/api/roles/${role.id}`);
      if (res.data.success) {
        setSelectedPerms(res.data.role.permissions || []);
      }
    } catch (error) {
      console.error('Rol izinleri alınamadı:', error);
      showToast('Rol izinleri yüklenemedi.', 'error');
    }
  };

  // Tekil İzin Aç / Kapat
  const togglePermission = (permKey) => {
    setSelectedPerms((prev) => 
      prev.includes(permKey) 
        ? prev.filter(k => k !== permKey) 
        : [...prev, permKey]
    );
  };

  // Bir Modüldeki Tüm İzinleri Aç / Kapat
  const toggleModulePermissions = (moduleId) => {
    const modulePermKeys = catalogPermissions
      .filter(p => p.category === moduleId)
      .map(p => p.key);

    const allSelected = modulePermKeys.every(k => selectedPerms.includes(k));

    if (allSelected) {
      // Tüm modül izinlerini kaldır
      setSelectedPerms(prev => prev.filter(k => !modulePermKeys.includes(k)));
    } else {
      // Modül izinlerinin eksik olanlarını ekle
      setSelectedPerms(prev => Array.from(new Set([...prev, ...modulePermKeys])));
    }
  };

  // Tüm İzinleri Ver (Tam Yetki)
  const handleSelectAllPermissions = () => {
    setSelectedPerms(catalogPermissions.map(p => p.key));
  };

  // Tüm İzinleri Temizle
  const handleClearAllPermissions = () => {
    setSelectedPerms([]);
  };

  // Form Kaydet
  const handleSubmitRole = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Lütfen bir rol adı giriniz.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      if (modalMode === 'add') {
        const res = await axios.post('http://localhost:5000/api/roles', {
          name: formName,
          slug: formSlug,
          description: formDesc,
          color: formColor,
          permissions: selectedPerms
        });
        if (res.data.success) {
          showToast('Yeni yetki rolü başarıyla oluşturuldu.');
          setModalMode(null);
          fetchRolesData();
        }
      } else if (modalMode === 'edit') {
        const res = await axios.put(`http://localhost:5000/api/roles/${editingRole.id}`, {
          name: formName,
          description: formDesc,
          color: formColor,
          permissions: selectedPerms
        });
        if (res.data.success) {
          showToast('Rol yetkileri başarıyla güncellendi.');
          setModalMode(null);
          fetchRolesData();
        }
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
      const res = await axios.delete(`http://localhost:5000/api/roles/${deleteModalRole.id}`);
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

  // Modül ikonunu getir
  const renderModuleIcon = (iconName) => {
    switch (iconName) {
      case 'LayoutGrid': return <LayoutGrid size={16} />;
      case 'CreditCard': return <CreditCard size={16} />;
      case 'Users': return <Users size={16} />;
      case 'Tags': return <Tags size={16} />;
      case 'Package': return <Package size={16} />;
      case 'ChefHat': return <ChefHat size={16} />;
      case 'BarChart3': return <BarChart3 size={16} />;
      case 'UserCheck': return <UserCheck size={16} />;
      case 'ShieldCheck': return <ShieldCheck size={16} />;
      default: return <ShieldCheck size={16} />;
    }
  };

  // Eylem etiketini getir (GÖRÜNTÜLEME, EKLEME, vb.)
  const renderActionBadge = (action) => {
    switch (action) {
      case 'view': return <span className="role-perm-action-badge view">Görüntüleme</span>;
      case 'create': return <span className="role-perm-action-badge create">Ekleme / Yazma</span>;
      case 'edit': return <span className="role-perm-action-badge edit">Düzenleme</span>;
      case 'delete': return <span className="role-perm-action-badge delete">Silme / İptal</span>;
      case 'special': return <span className="role-perm-action-badge special">Özel İşlem</span>;
      default: return null;
    }
  };

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
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 10000,
          background: toastMessage.type === 'error' ? '#ef4444' : '#10b981',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.9rem',
          fontWeight: '700',
          animation: 'rolesFadeIn 0.2s ease'
        }}>
          {toastMessage.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{toastMessage.message}</span>
        </div>
      )}

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
                    {role.name?.slice(0, 1)?.toUpperCase() || 'R'}
                  </div>
                  <span className={`role-badge-tag ${role.is_system ? 'system' : 'custom'}`}>
                    {role.is_system ? 'Sistem Rolü' : 'Özel Rol'}
                  </span>
                </div>

                <div className="role-card-body">
                  <h3 className="role-card-title">{role.name}</h3>
                  <span className="role-card-slug">@{role.slug}</span>
                  <p className="role-card-desc">{role.description || 'Açıklama belirtilmemiş.'}</p>
                </div>
              </div>

              <div>
                <div className="role-card-meta-row">
                  <div className="role-meta-item">
                    <ShieldCheck size={16} color="#0369a1" />
                    <span><strong>{role.permissions_count}</strong> / {catalogPermissions.length} Yetki</span>
                  </div>
                  <div className="role-meta-item">
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
                    <span>Yetkileri Düzenle</span>
                  </button>

                  {!role.is_system && (
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
        <div className="roles-modal-backdrop" onClick={() => !isSubmitting && setModalMode(null)}>
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
                    Görüntüleme, ekleme, düzenleme ve silme izinlerini belirleyin
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setModalMode(null)}
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
                      placeholder="Örn: Kıdemli Kasa Sorumlusu"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="role-form-input"
                    />
                  </div>

                  <div className="role-form-group">
                    <label className="role-form-label">Rol Kodu (Slug)</label>
                    <input 
                      type="text" 
                      placeholder="kidemli_kasa"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      className="role-form-input"
                      disabled={modalMode === 'edit' && editingRole?.is_system}
                    />
                  </div>

                  <div className="role-form-group">
                    <label className="role-form-label">Rol Rengi</label>
                    <div className="role-color-picker">
                      {COLOR_PALETTE.map((pal) => (
                        <div
                          key={pal.color}
                          className={`role-color-dot ${formColor === pal.color ? 'active' : ''}`}
                          style={{ background: pal.color }}
                          onClick={() => setFormColor(pal.color)}
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
                      value={formDesc}
                      onChange={(e) => setFormDesc(e.target.value)}
                      className="role-form-input"
                    />
                  </div>
                </div>

                {/* 2. İzin Matrisi Üst Çubuğu */}
                <div className="roles-matrix-toolbar">
                  <div className="roles-matrix-counter">
                    <span>Seçilen İzinler:</span>
                    <strong style={{ color: '#047857' }}>
                      {selectedPerms.length} / {catalogPermissions.length} Yetki
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      (%{catalogPermissions.length > 0 ? Math.round((selectedPerms.length / catalogPermissions.length) * 100) : 0})
                    </span>
                  </div>

                  <div className="roles-matrix-quick-btns">
                    <button
                      type="button"
                      onClick={handleSelectAllPermissions}
                      className="roles-quick-btn"
                    >
                      Tüm İzinleri Ver (Tam Yetki)
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAllPermissions}
                      className="roles-quick-btn"
                    >
                      Tümünü Temizle
                    </button>
                  </div>
                </div>

                {/* 3. Modül Bazında İzin Matrisi Kartları */}
                <div className="roles-modules-list">
                  {modules.map((mod) => {
                    const modulePerms = catalogPermissions.filter(p => p.category === mod.id);
                    const allSelected = modulePerms.length > 0 && modulePerms.every(p => selectedPerms.includes(p.key));
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
                            <button
                              type="button"
                              onClick={() => toggleModulePermissions(mod.id)}
                              className="role-module-toggle-all"
                            >
                              {allSelected ? 'Modülü Kaldır' : 'Tüm Modülü Seç'}
                            </button>
                          </div>
                        </div>

                        {/* Modül İzinleri Grid (Görme, Yazma, Düzenleme, Silme, Özel) */}
                        <div className="role-permissions-grid">
                          {modulePerms.map((perm) => {
                            const isChecked = selectedPerms.includes(perm.key);
                            return (
                              <div 
                                key={perm.key} 
                                className={`role-perm-item ${isChecked ? 'checked' : ''}`}
                                onClick={() => togglePermission(perm.key)}
                              >
                                <div className="role-perm-checkbox">
                                  {isChecked && <Check size={13} strokeWidth={3} />}
                                </div>
                                <div className="role-perm-content">
                                  {renderActionBadge(perm.action)}
                                  <span className="role-perm-label">{perm.label}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Alt Çubuğu */}
              <div className="roles-modal-footer">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="roles-btn-cancel"
                  disabled={isSubmitting}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="roles-btn-save"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="cat-spin" />
                      <span>Kaydediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      <span>{modalMode === 'add' ? 'Rolü Oluştur' : 'Yetkileri Güncelle'}</span>
                    </>
                  )}
                </button>
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
          </div>
        </div>
      )}
    </div>
  );
}
