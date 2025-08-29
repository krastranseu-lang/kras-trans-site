  // Run self test after startup
  try { setTimeout(selfTestLabels, 0); } catch(_) {}
  try { setTimeout(selfTest2D, 0); } catch(_) {}
  try { setTimeout(selfTest3D, 50); } catch(_) {}
