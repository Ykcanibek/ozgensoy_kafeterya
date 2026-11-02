import { useEffect, useState } from 'react';
import axios from 'axios';
import { periodQuery } from './reportUtils';

/**
 * Bir rapor uç noktasını seçili döneme göre çeker; dönem veya refreshKey değişince yeniden yükler.
 * Eski isteklerin geç gelen yanıtları yok sayılır (hızlı dönem değiştirmede yanlış veri gösterilmesin).
 * Uç nokta değişince önceki uç noktanın verisi döndürülmez (bölüm başka biçimde veri bekler).
 */
export default function useReportData(path, period, refreshKey, enabled = true, extraQuery = '') {
  const [state, setState] = useState({ data: null, loading: true, error: null, path });

  useEffect(() => {
    if (!enabled || period.incomplete) {
      setState({ data: null, loading: false, error: null, path });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ data: prev.path === path ? prev.data : null, loading: true, error: null, path }));
    axios.get(`/api/reports/${path}?${periodQuery(period)}${extraQuery ? `&${extraQuery}` : ''}`)
      .then(res => { if (!cancelled) setState({ data: res.data, loading: false, error: null, path }); })
      .catch(err => {
        if (!cancelled) setState({ data: null, loading: false, error: err.response?.data?.message || 'Rapor alınamadı.', path });
      });
    return () => { cancelled = true; };
  }, [path, period.startDate, period.endDate, period.compareStart, period.compareMode, period.incomplete, refreshKey, enabled, extraQuery]);

  return state.path === path ? state : { data: null, loading: true, error: null, path };
}
