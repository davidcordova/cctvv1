/**
 * Helper unificado para formatear el almacenamiento real y telemetría de dispositivos CCTV
 */

export const formatStorageInfo = (totalGb, freeGb, mediaType, hddStatus, isOnline = true) => {
  if (!isOnline) {
    return {
      primary: 'Desconectado',
      secondary: 'Sin conexión con el equipo',
      badge: 'Desconectado',
      isOk: false,
      percentFree: 0,
      percentUsed: 0
    };
  }

  // Caso: Cámaras IP sin MicroSD local pero grabando en NVR
  if (
    (!totalGb || totalGb === 0) &&
    (
      (mediaType && (mediaType.toLowerCase().includes('nvr') || mediaType.toLowerCase().includes('sin almacenamiento'))) ||
      (hddStatus && hddStatus.toLowerCase().includes('nvr'))
    )
  ) {
    return {
      primary: 'Grabación en NVR Centralizado',
      secondary: 'Sin MicroSD / SSD local',
      badge: '☁️ NVR Centralizado',
      isOk: true,
      percentFree: 0,
      percentUsed: 0,
      isNvrManaged: true
    };
  }

  // Si no hay datos de capacidad
  if (totalGb === null || totalGb === undefined || totalGb === 0) {
    return {
      primary: hddStatus || 'Normal (Formato OK)',
      secondary: 'Capacidad en sondeo',
      badge: mediaType || 'HDD SATA',
      isOk: true,
      percentFree: 0,
      percentUsed: 0
    };
  }

  const total = typeof totalGb === 'number' ? totalGb : parseFloat(totalGb) || 0;
  const free = typeof freeGb === 'number' ? freeGb : parseFloat(freeGb) || 0;
  const used = Math.max(0, total - free);
  const percentFree = total > 0 ? (free / total) * 100 : 0;
  const percentUsed = total > 0 ? (used / total) * 100 : 100;

  const isOk = !hddStatus || !hddStatus.toLowerCase().includes('error') && !hddStatus.toLowerCase().includes('dañado');

  // Formato TB (>= 1000 GB)
  if (total >= 1000) {
    const totalTb = (total / 1024).toFixed(2);
    const freeTb = (free / 1024).toFixed(2);
    const usedTb = (used / 1024).toFixed(2);

    if (free <= 0.05) {
      return {
        primary: `${totalTb} TB Total (${usedTb} TB ocupado)`,
        secondary: '100% Ocupado (Grabación Cíclica Activa)',
        badge: mediaType || '💾 HDD SATA',
        isOk,
        percentFree: 0,
        percentUsed: 100,
        totalStr: `${totalTb} TB`,
        freeStr: `0.00 TB`,
        usedStr: `${usedTb} TB`
      };
    }

    return {
      primary: `${freeTb} TB libres de ${totalTb} TB`,
      secondary: `${usedTb} TB usados (${percentFree.toFixed(1)}% libre)`,
      badge: mediaType || '💾 HDD SATA',
      isOk,
      percentFree: Number(percentFree.toFixed(1)),
      percentUsed: Number(percentUsed.toFixed(1)),
      totalStr: `${totalTb} TB`,
      freeStr: `${freeTb} TB`,
      usedStr: `${usedTb} TB`
    };
  }

  // Formato GB (< 1000 GB, ej. tarjetas MicroSD de 32GB, 64GB, 128GB, 256GB o SSD)
  if (free <= 0.05) {
    return {
      primary: `${total.toFixed(1)} GB Total (${used.toFixed(1)} GB ocupado)`,
      secondary: '100% Ocupado (Grabación Cíclica Activa)',
      badge: mediaType || '📼 MicroSD Local',
      isOk,
      percentFree: 0,
      percentUsed: 100,
      totalStr: `${total.toFixed(1)} GB`,
      freeStr: `0.0 GB`,
      usedStr: `${used.toFixed(1)} GB`
    };
  }

  return {
    primary: `${free.toFixed(1)} GB libres de ${total.toFixed(1)} GB`,
    secondary: `${used.toFixed(1)} GB usados (${percentFree.toFixed(1)}% libre)`,
    badge: mediaType || '📼 MicroSD Local',
    isOk,
    percentFree: Number(percentFree.toFixed(1)),
    percentUsed: Number(percentUsed.toFixed(1)),
    totalStr: `${total.toFixed(1)} GB`,
    freeStr: `${free.toFixed(1)} GB`,
    usedStr: `${used.toFixed(1)} GB`
  };
};
