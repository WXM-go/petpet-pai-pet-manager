function shouldSyncBundledFiles(sourceFiles = [], targetFiles = []) {
  if (sourceFiles.length !== targetFiles.length) return true;
  return sourceFiles.some((source, index) => {
    const target = targetFiles[index];
    if (!source?.exists || !target?.exists) return true;
    if (source.size !== target.size) return true;
    return source.content !== undefined || target.content !== undefined
      ? source.content !== target.content
      : false;
  });
}

module.exports = { shouldSyncBundledFiles };
