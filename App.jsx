import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 1. تهيئة Supabase Client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. دالة مساعدة لرفع الملفات إلى Supabase Storage بدلاً من Base64
export const uploadPatientFile = async (file, patientId, folder = 'general') => {
  // فحص حجم الملف (الحد الأقصى 10 ميجابايت)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('حجم الملف كبير جداً، يرجى اختيار ملف أقل من 10 ميجابايت.');
  }

  const fileExt = file.name.split('.').pop();
  const filePath = `${patientId}/${folder}/${Date.now()}.${fileExt}`;

  // رفع الملف للـ Bucket الخاص بالعيادة
  const { error: uploadError } = await supabase.storage
    .from('patient-files')
    .upload(filePath, file, { cacheControl: '3600', upsert: false });

  if (uploadError) {
    throw new Error(`فشل رفع الملف: ${uploadError.message}`);
  }

  // استخراج رابط URL العام للملف
  const { data: { publicUrl } } = supabase.storage
    .from('patient-files')
    .getPublicUrl(filePath);

  return publicUrl;
};

// 3. مكون نموذج رفع الروشتات (Prescription Form)
export const PrescriptionForm = ({ patientId, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('يرجى اختيار صورة الروشتة أولاً');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. رفع الصورة إلى Storage
      const imageUrl = await uploadPatientFile(file, patientId, 'prescriptions');

      // 2. حفظ الرابط فقط في قاعدة البيانات
      const { data, error: dbError } = await supabase
        .from('prescriptions')
        .insert([
          {
            patient_id: patientId,
            image_url: imageUrl,
            notes: notes,
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (dbError) throw dbError;

      setFile(null);
      setNotes('');
      if (onSuccess) onSuccess(data[0]);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء حفظ الروشتة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="font-bold text-lg">إضافة روشتة جديدة</h3>
      
      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">صورة الروشتة:</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            setError(null);
            if (e.target.files[0]) setFile(e.target.files[0]);
          }}
          className="w-full text-sm border rounded p-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">ملاحظات:</label>

          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="أي تفاصيل أو ملاحظات حول العلاج..."
          className="w-full border rounded p-2 text-sm"
          rows={3}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:bg-gray-400"
      >
        {loading ? 'جاري الرفع والحفظ...' : 'حفظ الروشتة'}
      </button>
    </form>
  );
};

// 4. مكون رفع أشعة وصور المريض (Image Upload Form)
export const ImageUploadForm = ({ patientId, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('x-ray');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('يرجى تحديد الصورة المراد رفعها');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // رفع الملف إلى Storage
      const imageUrl = await uploadPatientFile(file, patientId, category);

      // حفظ بيانات الصورة في جدول patient_images
      const { data, error: dbError } = await supabase
        .from('patient_images')
        .insert([
          {
            patient_id: patientId,
            image_url: imageUrl,
            title: title || 'بدون عنوان',
            category: category,
            created_at: new Date().toISOString(),
          },
        ])
        .select();

      if (dbError) throw dbError;

      setFile(null);
      setTitle('');
      if (onSuccess) onSuccess(data[0]);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء رفع الصورة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleUpload} className="space-y-4 p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="font-bold text-lg">رفع أشعة أو صور طبية</h3>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      <div>
        <label className="block text-sm font-medium mb-1">نوع المرفق:</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full border rounded p-2 text-sm"
        >
          <option value="x-ray">أشعة سينية (X-Ray)</option>
          <option value="lab">تحاليل طبية</option>
          <option value="scan">رنين / مقطعية</option>
          <option value="other">أخرى</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">عنوان/وصف الصورة:</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثال: أشعة على الصدر بتاريخ اليوم"
          className="w-full border rounded p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">الملف:</label>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(e) => {
            setError(null);
            if (e.target.files[0]) setFile(e.target.files[0]);
          }}
          className="w-full text-sm border rounded p-2"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition disabled:bg-gray-400"
      >
        {loading ? 'جاري رفع الملف...' : 'رفع الملف'}
      </button>
    </form>
  );
};

// 5. مكون تفاصيل المريض وإدارة البيانات (Main Patient Detail View)
export const PatientDetails = ({ patientId }) => {
  const [patient, setPatient] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);

  // جلب كافة بيانات المريض بشكل مباشر
  const fetchPatientData = async () => {
    setLoading(true);
    try {
      // 1. جلب البيانات الأساسية
      const { data: patientData, error: pError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single();
      if (pError) throw pError;

      // 2. جلب الروشتات
      const { data: prescData, error: prError } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (prError) throw prError;

      // 3. جلب الصور والأشعة
      const { data: imgData, error: imgError } = await supabase
        .from('patient_images')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });
      if (imgError) throw imgError;

      setPatient(patientData);
      setPrescriptions(prescData || []);
      setImages(imgData || []);
    } catch (err) {
      console.error('خطأ في جلب البيانات:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchPatientData();
    }
  }, [patientId]);

  if (loading) return <div className="p-4 text-center">جاري تحميل بيانات المريض...</div>;
  if (!patient) return <div className="p-4 text-center">لم يتم العثور على المريض.</div>;

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* هيدر تفاصيل المريض */}
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
        <div>
          <h2 className="text-2xl font-bold">{patient.full_name}</h2>
          <p className="text-gray-500 text-sm">الهاتف: {patient.phone || 'غير مدخل'}</p>
        </div>
        <button
          onClick={fetchPatientData}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm transition"
        >
          تحديث البيانات 🔄
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* نماذج الإضافة */}
        <PrescriptionForm
          patientId={patientId}
          onSuccess={(newPrescription) => {
            setPrescriptions([newPrescription, ...prescriptions]);
          }}
        />

        <ImageUploadForm
          patientId={patientId}
          onSuccess={(newImg) => {
            setImages([newImg, ...images]);
          }}
        />
      </div>

      {/* قائمة الروشتات المرفوقة */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <h3 className="font-bold text-lg mb-4">سجل الروشتات</h3>
        {prescriptions.length === 0 ? (
          <p className="text-gray-500 text-sm">لا توجد روشتات مسجلة.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {prescriptions.map((item) => (
              <div key={item.id} className="border rounded p-2 text-center">
                <a href={item.image_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={item.image_url}
                    alt="روشتة"
                    className="w-full h-32 object-cover rounded mb-2 hover:opacity-90"
                  />
                </a>
                <p className="text-xs text-gray-500">{item.notes || 'بدون ملاحظات'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* قائمة الأشعة والصور */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <h3 className="font-bold text-lg mb-4">الأشعة والتحاليل</h3>
        {images.length === 0 ? (
          <p className="text-gray-500 text-sm">لا توجد صور أو أشعة مرفوعة.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((img) => (
              <div key={img.id} className="border rounded p-2 text-center">
                <a href={img.image_url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={img.image_url}
                    alt={img.title}
                    className="w-full h-32 object-cover rounded mb-2 hover:opacity-90"
                  />
                </a>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  {img.category}
                </span>
                <p className="text-xs font-semibold mt-1">{img.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientDetails;
