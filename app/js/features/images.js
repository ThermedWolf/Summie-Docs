// ==================== IMAGE MANIPULATION ====================

class ImageManager {
    constructor() {
        this.images = new Map(); // Store image data by ID
        this.selectedImage = null;
        this.isDragging = false;
        this.dragCandidate = null;
        this.draggedWrapper = null;
        this.dropPlaceholder = null;
        this.dropTarget = null;
        this.dropPosition = 'after';
        this.floatDragData = null;
        this.suppressNextEditorClick = false;
        this.isResizing = false;
        this.isCropping = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.resizeHandle = null;
        this.shiftPressed = false;
        this.cropData = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.trackShiftKey();
    }

    setupEventListeners() {
        // Upload image button
        const uploadBtn = document.getElementById('uploadImageBtn');
        const imageFileInput = document.getElementById('imageFileInput');

        if (uploadBtn && imageFileInput) {
            uploadBtn.addEventListener('click', () => {
                imageFileInput.click();
            });

            imageFileInput.addEventListener('change', (e) => {
                this.handleImageUpload(e);
            });
        }

        // Image URL button
        const insertUrlBtn = document.getElementById('insertImageUrlBtn');
        const imageUrlModal = document.getElementById('imageUrlModal');
        const closeUrlModal = document.getElementById('closeImageUrlModal');
        const cancelUrlModal = document.getElementById('cancelImageUrlModal');
        const insertUrlButton = document.getElementById('insertImageUrl');
        const imageUrlInput = document.getElementById('imageUrlInput');

        if (insertUrlBtn) {
            insertUrlBtn.addEventListener('click', () => {
                imageUrlModal.classList.add('active');
                imageUrlInput.value = '';
                imageUrlInput.focus();
            });
        }

        if (closeUrlModal) {
            closeUrlModal.addEventListener('click', () => {
                imageUrlModal.classList.remove('active');
            });
        }

        if (cancelUrlModal) {
            cancelUrlModal.addEventListener('click', () => {
                imageUrlModal.classList.remove('active');
            });
        }

        if (insertUrlButton) {
            insertUrlButton.addEventListener('click', () => {
                const url = imageUrlInput.value.trim();
                if (url) {
                    this.insertImageFromUrl(url);
                    imageUrlModal.classList.remove('active');
                }
            });
        }

        // Enter key in URL input
        if (imageUrlInput) {
            imageUrlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const url = imageUrlInput.value.trim();
                    if (url) {
                        this.insertImageFromUrl(url);
                        imageUrlModal.classList.remove('active');
                    }
                }
            });
        }

        // Keep image selection while using topbar/context controls. Only a click
        // in the document area itself should clear the selected image.
        document.addEventListener('click', (e) => {
            const editor = document.getElementById('editor');
            if (!editor || !editor.contains(e.target)) return;
            if (this.suppressNextEditorClick) {
                this.suppressNextEditorClick = false;
                return;
            }
            if (!e.target.closest('.editable-image-wrapper')) {
                this.deselectImage();
            }
        });

        // Global mouse events for dragging and resizing - IMPORTANT: these need to be on document
        document.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });

        document.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });

        // Also listen for mouseleave to catch when mouse leaves window
        document.addEventListener('mouseleave', (e) => {
            this.handleMouseUp(e);
        });
    }

    trackShiftKey() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                this.shiftPressed = true;
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                this.shiftPressed = false;
            }
        });
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            this.showNotification('Ongeldig bestand', 'Selecteer een afbeeldingsbestand.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            // Compress the image before inserting
            this.compressImage(event.target.result, file.name);
        };
        reader.readAsDataURL(file);

        // Reset input
        e.target.value = '';
    }

    compressImage(dataUrl, fileName) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Max dimensions to keep file size reasonable
            const maxWidth = 1200;
            const maxHeight = 1200;

            if (width > maxWidth || height > maxHeight) {
                if (width > height) {
                    height = (height / width) * maxWidth;
                    width = maxWidth;
                } else {
                    width = (width / height) * maxHeight;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG with 0.8 quality (good balance)
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            console.log('Image compressed:', {
                original: (dataUrl.length / 1024).toFixed(2) + ' KB',
                compressed: (compressedDataUrl.length / 1024).toFixed(2) + ' KB',
                dimensions: `${width}x${height}`
            });

            this.insertImage(compressedDataUrl, fileName);
        };
        img.src = dataUrl;
    }

    insertImageFromUrl(url) {
        // Create temporary image to validate URL
        const tempImg = new Image();
        tempImg.onload = () => {
            // Convert to data URL and compress
            const canvas = document.createElement('canvas');
            let width = tempImg.width;
            let height = tempImg.height;

            // Max dimensions to keep file size reasonable
            const maxWidth = 1200;
            const maxHeight = 1200;

            if (width > maxWidth || height > maxHeight) {
                if (width > height) {
                    height = (height / width) * maxWidth;
                    width = maxWidth;
                } else {
                    width = (width / height) * maxHeight;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tempImg, 0, 0, width, height);

            try {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                console.log('URL image compressed:', (dataUrl.length / 1024).toFixed(2) + ' KB');
                this.insertImage(dataUrl, 'url-image.jpg');
            } catch (error) {
                // If CORS error, show error message
                this.showNotification('Fout', 'CORS fout - de afbeelding kan niet worden geladen. Upload het bestand in plaats daarvan.', 'error');
            }
        };
        tempImg.onerror = () => {
            this.showNotification('Fout', 'Kon afbeelding niet laden van URL.', 'error');
        };
        tempImg.crossOrigin = 'anonymous';
        tempImg.src = url;
    }

    insertImage(src, fileName, isExternalUrl = false) {
        const editor = document.getElementById('editor');
        const imageId = this.createImageId();

        // Create image wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'editable-image-wrapper image-layout-inline';
        wrapper.dataset.imageId = imageId;
        wrapper.dataset.layout = 'inline';
        wrapper.contentEditable = 'false'; // Make the wrapper non-editable but moveable

        // Create image
        const img = document.createElement('img');
        img.src = src;
        img.alt = fileName;

        // Create toolbar
        const toolbar = this.createImageToolbar();

        // Create resize handles
        const handles = this.createResizeHandles(imageId);

        wrapper.appendChild(toolbar);
        wrapper.appendChild(img);
        handles.forEach(handle => wrapper.appendChild(handle));

        this.insertWrapperSafely(editor, wrapper);

        // Store image data
        this.images.set(imageId, {
            id: imageId,
            src: src,
            fileName: fileName,
            isExternalUrl: isExternalUrl,
            width: null, // Will be set after load
            height: null,
            originalWidth: null,
            originalHeight: null,
            naturalWidth: null,
            naturalHeight: null,
            x: 0,
            y: 0,
            layout: 'inline',
            cropX: 0,
            cropY: 0,
            cropWidth: null,
            cropHeight: null
        });

        // Wait for image to load to get dimensions
        img.onload = () => {
            const imageData = this.images.get(imageId);
            if (!imageData) return;
            imageData.naturalWidth = img.naturalWidth;
            imageData.naturalHeight = img.naturalHeight;
            imageData.width = img.offsetWidth;
            imageData.height = img.offsetHeight;
            imageData.originalWidth = imageData.originalWidth || img.offsetWidth;
            imageData.originalHeight = imageData.originalHeight || img.offsetHeight;
            imageData.cropWidth = img.naturalWidth;
            imageData.cropHeight = img.naturalHeight;
            this.saveToLocalStorage();
        };

        // Setup click handler
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectImage(imageId);
        });

        this.setupImageDrag(wrapper, imageId);

        this.selectImage(imageId);
        this.saveToLocalStorage();
        this.showNotification('Afbeelding toegevoegd', 'Tip: Versleep de afbeelding om te verplaatsen, of gebruik Ctrl+X en Ctrl+V', 'success');
    }

    createImageId() {
        let id;
        do {
            id = 'img_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        } while (this.images.has(id) || document.querySelector(`[data-image-id="${id}"]`));
        return id;
    }

    insertWrapperSafely(editor, wrapper) {
        if (!editor) return;

        const selectedWrapper = this.selectedImage
            ? document.querySelector(`[data-image-id="${this.selectedImage}"]`)
            : null;

        const selection = window.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        const selectionNode = range ? (range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer) : null;
        const selectionInEditor = !!(selectionNode && editor.contains(selectionNode));
        const selectionInImage = !!(selectionNode && selectionNode.closest && selectionNode.closest('.editable-image-wrapper'));

        const br = document.createElement('br');

        if (selectionInEditor && !selectionInImage && range) {
            range.insertNode(wrapper);
            range.setStartAfter(wrapper);
            range.collapse(true);
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
        }

        if (selectedWrapper && editor.contains(selectedWrapper)) {
            selectedWrapper.after(wrapper, br);
            this.setCursorAfterNode(br);
            return;
        }

        editor.appendChild(wrapper);
        editor.appendChild(br);
        this.setCursorAfterNode(br);
    }

    setCursorAfterNode(node) {
        const selection = window.getSelection();
        if (!selection || !node?.parentNode) return;
        const range = document.createRange();
        range.setStartAfter(node);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    setupImageDrag(wrapper, imageId) {
        wrapper.addEventListener('mousedown', (e) => {
            if (this.isCropping || this.isResizing) return;
            if (e.button !== 0) return;
            if (e.target.closest('.image-toolbar, .resize-handle, .crop-overlay, .crop-buttons')) return;

            const wasSelected = this.selectedImage === imageId && wrapper.classList.contains('selected');
            this.selectImage(imageId);
            if (!wasSelected) {
                this.suppressNextEditorClick = true;
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (this.isFreePositioned(wrapper)) {
                this.startFreeImageDrag(e, wrapper, imageId);
                return;
            }
            this.dragCandidate = {
                imageId: imageId,
                wrapper: wrapper,
                startX: e.clientX,
                startY: e.clientY
            };
            e.preventDefault();
            e.stopPropagation();
        });
    }

    createImageToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'image-toolbar';

        const buttons = [
            { id: 'crop', icon: this.getCropIcon(), label: 'Bijsnijden', action: () => this.startCrop() },
            { id: 'delete', icon: this.getDeleteIcon(), label: 'Verwijderen', action: () => this.deleteImage() }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.innerHTML = btn.icon;
            button.title = btn.label;
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.action();
            });
            toolbar.appendChild(button);
        });

        return toolbar;
    }

    createResizeHandles(imageId) {
        const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        return positions.map(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos}`;
            handle.addEventListener('mousedown', (e) => {
                const wrapper = handle.closest('.editable-image-wrapper');
                const id = imageId || wrapper?.dataset.imageId;
                if (!id) return;
                this.selectImage(id);
                e.stopPropagation();
                this.startResize(e, pos);
            });
            handle.addEventListener('click', (e) => e.stopPropagation());
            return handle;
        });
    }

    selectImage(imageId) {
        this.deselectImage();

        const wrapper = document.querySelector(`[data-image-id="${imageId}"]`);
        if (wrapper) {
            wrapper.classList.add('selected');
            this.selectedImage = imageId;
        }
    }

    deselectImage() {
        if (this.selectedImage) {
            const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
            if (wrapper) {
                wrapper.classList.remove('selected');
            }
            this.selectedImage = null;
        }
    }

    startResize(e, handle) {
        if (this.isCropping) return;

        const wrapper = e.target.closest('.editable-image-wrapper') || document.querySelector(`[data-image-id="${this.selectedImage}"]`);
        const imageId = wrapper?.dataset.imageId;
        if (!wrapper || !imageId) return;
        this.selectImage(imageId);

        this.isResizing = true;
        this.resizeHandle = handle;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        const img = wrapper.querySelector('img');
        this.resizeStartWidth = img.offsetWidth;
        this.resizeStartHeight = img.offsetHeight;

        const imageData = this.images.get(this.selectedImage);
        this.aspectRatio = imageData.naturalWidth / imageData.naturalHeight;

        e.preventDefault();
    }

    handleMouseMove(e) {
        if (this.floatDragData) {
            this.handleFreeImageDragMove(e);
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (this.dragCandidate && !this.isDragging) {
            const deltaX = Math.abs(e.clientX - this.dragCandidate.startX);
            const deltaY = Math.abs(e.clientY - this.dragCandidate.startY);
            if (deltaX > 4 || deltaY > 4) {
                this.startImageDrag();
            }
        }

        if (this.isDragging) {
            this.handleImageDragMove(e);
            e.preventDefault();
            e.stopPropagation();
        } else if (this.isResizing && this.selectedImage) {
            const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
            const img = wrapper.querySelector('img');

            const deltaX = e.clientX - this.dragStartX;
            const deltaY = e.clientY - this.dragStartY;

            let newWidth, newHeight;

            // Check if it's a corner handle (these preserve aspect ratio)
            const isCorner = ['nw', 'ne', 'sw', 'se'].includes(this.resizeHandle);

            if (isCorner) {
                // Corner handles always preserve aspect ratio
                if (this.resizeHandle === 'se') {
                    newWidth = this.resizeStartWidth + deltaX;
                } else if (this.resizeHandle === 'sw') {
                    newWidth = this.resizeStartWidth - deltaX;
                } else if (this.resizeHandle === 'ne') {
                    newWidth = this.resizeStartWidth + deltaX;
                } else { // nw
                    newWidth = this.resizeStartWidth - deltaX;
                }
                newHeight = newWidth / this.aspectRatio;
            } else {
                // Side handles allow stretching
                newWidth = this.resizeStartWidth;
                newHeight = this.resizeStartHeight;

                if (this.resizeHandle === 'n') {
                    newHeight = this.resizeStartHeight - deltaY;
                } else if (this.resizeHandle === 's') {
                    newHeight = this.resizeStartHeight + deltaY;
                } else if (this.resizeHandle === 'e') {
                    newWidth = this.resizeStartWidth + deltaX;
                } else if (this.resizeHandle === 'w') {
                    newWidth = this.resizeStartWidth - deltaX;
                }
            }

            // Apply minimum size constraints
            newWidth = Math.max(50, newWidth);
            newHeight = Math.max(50, newHeight);

            img.style.width = newWidth + 'px';
            img.style.height = newHeight + 'px';

            e.preventDefault();
            e.stopPropagation();
        } else if (this.cropData && (this.cropData.isDragging || this.cropData.isResizing)) {
            this.handleCropMove(e);
            e.preventDefault();
        }
    }

    startImageDrag() {
        if (!this.dragCandidate) return;

        this.isDragging = true;
        this.draggedWrapper = this.dragCandidate.wrapper;
        this.dropPlaceholder = document.createElement('div');
        this.dropPlaceholder.className = 'image-drop-placeholder';
        this.draggedWrapper.classList.add('dragging');
        this.draggedWrapper.after(this.dropPlaceholder);
        document.body.classList.add('image-drag-active');
    }

    handleImageDragMove(e) {
        if (!this.draggedWrapper || !this.dropPlaceholder) return;

        this.draggedWrapper.style.transform = `translate(${e.clientX - this.dragCandidate.startX}px, ${e.clientY - this.dragCandidate.startY}px)`;

        const target = this.getImageDropTarget(e.clientX, e.clientY);
        if (!target || target === this.draggedWrapper || target === this.dropPlaceholder) return;

        const rect = target.getBoundingClientRect();
        this.dropPosition = e.clientY < rect.top + (rect.height / 2) ? 'before' : 'after';
        this.dropTarget = target;

        if (this.dropPosition === 'before') {
            target.before(this.dropPlaceholder);
        } else {
            target.after(this.dropPlaceholder);
        }
    }

    getImageDropTarget(x, y) {
        const editor = document.getElementById('editor');
        if (!editor) return null;

        const hiddenDisplay = this.draggedWrapper.style.display;
        this.draggedWrapper.style.display = 'none';
        const element = document.elementFromPoint(x, y);
        this.draggedWrapper.style.display = hiddenDisplay;

        if (!element || !editor.contains(element)) return null;

        const directChild = element.closest('#editor > *');
        if (directChild && directChild !== this.draggedWrapper && directChild !== this.dropPlaceholder) {
            return directChild;
        }

        return editor.lastElementChild || null;
    }

    handleMouseUp(e) {
        if (this.floatDragData) {
            this.finishFreeImageDrag();
            this.suppressNextEditorClick = true;
        }

        if (this.isDragging && this.draggedWrapper) {
            this.finishImageDrag();
            this.suppressNextEditorClick = true;
        }

        // Save if we were resizing
        if (this.isResizing && this.selectedImage) {
            const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
            if (wrapper) {
                const img = wrapper.querySelector('img');
                if (img) {
                    const imageData = this.images.get(this.selectedImage);
                    if (imageData) {
                        imageData.width = img.offsetWidth;
                        imageData.height = img.offsetHeight;
                        this.saveToLocalStorage();
                    }
                }
                this.selectImage(this.selectedImage);
                this.suppressNextEditorClick = true;
            }
        }

        // Always clear all states
        this.isDragging = false;
        this.dragCandidate = null;
        this.floatDragData = null;
        this.isResizing = false;
        this.resizeHandle = null;

        // Clear crop data states
        if (this.cropData) {
            this.cropData.isDragging = false;
            this.cropData.isResizing = false;
        }
    }

    finishImageDrag() {
        if (this.dropPlaceholder && this.dropPlaceholder.parentNode) {
            this.dropPlaceholder.replaceWith(this.draggedWrapper);
        }

        this.draggedWrapper.classList.remove('dragging');
        this.draggedWrapper.style.transform = '';
        document.body.classList.remove('image-drag-active');

        this.selectImage(this.draggedWrapper.dataset.imageId);
        this.dropPlaceholder = null;
        this.dropTarget = null;
        this.draggedWrapper = null;
        this.saveToLocalStorage();

        const editor = document.getElementById('editor');
        if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    getImageLayout(imageId) {
        const wrapper = document.querySelector(`[data-image-id="${imageId || this.selectedImage}"]`);
        return wrapper?.dataset.layout || 'inline';
    }

    setImageLayout(layout, options = {}) {
        const imageId = options.imageId || this.selectedImage;
        if (!imageId) return;
        this.selectedImage = imageId;
        const wrapper = document.querySelector(`[data-image-id="${imageId}"]`);
        if (!wrapper) return;

        const nextLayout = layout || 'inline';
        const wasFree = this.isFreePositioned(wrapper);
        const imageData = this.images.get(imageId);
        const editor = document.getElementById('editor');

        wrapper.classList.remove(
            'image-layout-inline',
            'image-layout-square',
            'image-layout-top-bottom',
            'image-layout-floating',
            'image-layout-front',
            'image-layout-behind',
            'image-align-left',
            'image-align-right'
        );

        wrapper.dataset.layout = nextLayout;
        if (imageData) imageData.layout = nextLayout;

        if (nextLayout === 'square') {
            const align = options.align || wrapper.dataset.align || imageData?.align || 'left';
            wrapper.dataset.align = align;
            wrapper.classList.add('image-layout-square', align === 'right' ? 'image-align-right' : 'image-align-left');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.zIndex = '';
            if (imageData) imageData.align = align;
        } else if (nextLayout === 'top-bottom') {
            wrapper.classList.add('image-layout-top-bottom');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.zIndex = '';
        } else if (nextLayout === 'floating' || nextLayout === 'front' || nextLayout === 'behind') {
            const className = nextLayout === 'front'
                ? 'image-layout-front'
                : nextLayout === 'behind'
                    ? 'image-layout-behind'
                    : 'image-layout-floating';
            wrapper.classList.add(className);
            this.placeFreeImage(wrapper, imageData, wasFree);
        } else {
            wrapper.classList.add('image-layout-inline');
            wrapper.style.left = '';
            wrapper.style.top = '';
            wrapper.style.zIndex = '';
        }

        if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
        this.saveToLocalStorage();
    }

    isFreePositioned(wrapper) {
        const layout = wrapper?.dataset.layout;
        return layout === 'floating' || layout === 'front' || layout === 'behind';
    }

    placeFreeImage(wrapper, imageData, keepPosition) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const editorRect = editor.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        let x = keepPosition && imageData ? imageData.x : null;
        let y = keepPosition && imageData ? imageData.y : null;

        if (x === null || y === null || x === undefined || y === undefined) {
            x = Math.max(0, wrapperRect.left - editorRect.left + editor.scrollLeft);
            y = Math.max(0, wrapperRect.top - editorRect.top + editor.scrollTop);
        }

        wrapper.style.left = Math.round(x) + 'px';
        wrapper.style.top = Math.round(y) + 'px';
        wrapper.style.zIndex = wrapper.dataset.layout === 'behind' ? '1' : wrapper.dataset.layout === 'front' ? '30' : '12';
        if (imageData) {
            imageData.x = Math.round(x);
            imageData.y = Math.round(y);
        }
    }

    startFreeImageDrag(e, wrapper, imageId) {
        const editor = document.getElementById('editor');
        if (!editor) return;
        const imageData = this.images.get(imageId);
        this.placeFreeImage(wrapper, imageData, true);

        this.floatDragData = {
            wrapper,
            imageId,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseFloat(wrapper.style.left) || 0,
            startTop: parseFloat(wrapper.style.top) || 0
        };
        wrapper.classList.add('dragging');
        document.body.classList.add('image-drag-active');
        e.preventDefault();
        e.stopPropagation();
    }

    handleFreeImageDragMove(e) {
        const data = this.floatDragData;
        if (!data) return;
        const editor = document.getElementById('editor');
        const img = data.wrapper.querySelector('img');
        if (!editor || !img) return;

        const maxLeft = Math.max(0, editor.clientWidth - img.offsetWidth);
        const maxTop = Math.max(0, editor.scrollHeight - img.offsetHeight);
        const nextLeft = Math.max(0, Math.min(maxLeft, data.startLeft + e.clientX - data.startX));
        const nextTop = Math.max(0, Math.min(maxTop, data.startTop + e.clientY - data.startY));

        data.wrapper.style.left = Math.round(nextLeft) + 'px';
        data.wrapper.style.top = Math.round(nextTop) + 'px';
    }

    finishFreeImageDrag() {
        const data = this.floatDragData;
        if (!data) return;
        const imageData = this.images.get(data.imageId);
        if (imageData) {
            imageData.x = parseFloat(data.wrapper.style.left) || 0;
            imageData.y = parseFloat(data.wrapper.style.top) || 0;
        }
        data.wrapper.classList.remove('dragging');
        document.body.classList.remove('image-drag-active');
        this.saveToLocalStorage();

        const editor = document.getElementById('editor');
        if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    startCrop() {
        if (!this.selectedImage) return;

        const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
        const img = wrapper.querySelector('img');
        wrapper.classList.add('cropping');
        this.isCropping = true;

        // Create crop overlay
        const overlay = document.createElement('div');
        overlay.className = 'crop-overlay';

        // Create crop box
        const cropBox = document.createElement('div');
        cropBox.className = 'crop-box';
        const imgRect = img.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();

        cropBox.style.left = '10px';
        cropBox.style.top = '10px';
        cropBox.style.width = (img.offsetWidth - 20) + 'px';
        cropBox.style.height = (img.offsetHeight - 20) + 'px';

        // Create crop handles
        ['nw', 'ne', 'sw', 'se'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${pos}`;
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startCropResize(e, pos, cropBox);
            });
            cropBox.appendChild(handle);
        });

        // Crop box dragging
        cropBox.addEventListener('mousedown', (e) => {
            if (e.target === cropBox) {
                this.startCropDrag(e, cropBox, img);
            }
        });

        overlay.appendChild(cropBox);
        wrapper.appendChild(overlay);

        // Create crop buttons
        const buttons = document.createElement('div');
        buttons.className = 'crop-buttons';
        buttons.innerHTML = `
            <button class="btn-confirm">Toepassen</button>
            <button class="btn-cancel">Annuleren</button>
        `;

        buttons.querySelector('.btn-confirm').addEventListener('click', () => {
            this.applyCrop(cropBox, img);
        });

        buttons.querySelector('.btn-cancel').addEventListener('click', () => {
            this.cancelCrop();
        });

        wrapper.appendChild(buttons);
    }

    startCropDrag(e, cropBox, img) {
        this.cropData = {
            isDragging: true,
            isResizing: false,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseInt(cropBox.style.left),
            startTop: parseInt(cropBox.style.top),
            cropBox: cropBox,
            img: img,
            maxWidth: img.offsetWidth,
            maxHeight: img.offsetHeight
        };
        e.preventDefault();
    }

    startCropResize(e, handle, cropBox) {
        const img = document.querySelector(`[data-image-id="${this.selectedImage}"]`).querySelector('img');
        this.cropData = {
            isDragging: false,
            isResizing: true,
            handle: handle,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: parseInt(cropBox.style.left),
            startTop: parseInt(cropBox.style.top),
            startWidth: parseInt(cropBox.style.width),
            startHeight: parseInt(cropBox.style.height),
            cropBox: cropBox,
            img: img,
            maxWidth: img.offsetWidth,
            maxHeight: img.offsetHeight
        };
        e.preventDefault();
    }

    handleCropMove(e) {
        if (!this.cropData) return;

        const deltaX = e.clientX - this.cropData.startX;
        const deltaY = e.clientY - this.cropData.startY;

        if (this.cropData.isDragging) {
            let newLeft = this.cropData.startLeft + deltaX;
            let newTop = this.cropData.startTop + deltaY;

            const cropWidth = parseInt(this.cropData.cropBox.style.width);
            const cropHeight = parseInt(this.cropData.cropBox.style.height);

            newLeft = Math.max(0, Math.min(newLeft, this.cropData.maxWidth - cropWidth));
            newTop = Math.max(0, Math.min(newTop, this.cropData.maxHeight - cropHeight));

            this.cropData.cropBox.style.left = newLeft + 'px';
            this.cropData.cropBox.style.top = newTop + 'px';
        } else if (this.cropData.isResizing) {
            const handle = this.cropData.handle;
            let newLeft = this.cropData.startLeft;
            let newTop = this.cropData.startTop;
            let newWidth = this.cropData.startWidth;
            let newHeight = this.cropData.startHeight;

            if (handle.includes('e')) {
                newWidth = Math.min(this.cropData.startWidth + deltaX, this.cropData.maxWidth - newLeft);
            } else if (handle.includes('w')) {
                const maxDelta = this.cropData.startLeft;
                const adjustedDelta = Math.max(-maxDelta, Math.min(deltaX, this.cropData.startWidth - 20));
                newLeft = this.cropData.startLeft + adjustedDelta;
                newWidth = this.cropData.startWidth - adjustedDelta;
            }

            if (handle.includes('s')) {
                newHeight = Math.min(this.cropData.startHeight + deltaY, this.cropData.maxHeight - newTop);
            } else if (handle.includes('n')) {
                const maxDelta = this.cropData.startTop;
                const adjustedDelta = Math.max(-maxDelta, Math.min(deltaY, this.cropData.startHeight - 20));
                newTop = this.cropData.startTop + adjustedDelta;
                newHeight = this.cropData.startHeight - adjustedDelta;
            }

            newWidth = Math.max(20, newWidth);
            newHeight = Math.max(20, newHeight);

            this.cropData.cropBox.style.left = newLeft + 'px';
            this.cropData.cropBox.style.top = newTop + 'px';
            this.cropData.cropBox.style.width = newWidth + 'px';
            this.cropData.cropBox.style.height = newHeight + 'px';
        }

        e.preventDefault();
        e.stopPropagation();
    }

    applyCrop(cropBox, img) {
        const imageData = this.images.get(this.selectedImage);

        // Calculate crop in terms of original image dimensions
        const scaleX = imageData.naturalWidth / img.offsetWidth;
        const scaleY = imageData.naturalHeight / img.offsetHeight;

        const cropLeft = parseInt(cropBox.style.left);
        const cropTop = parseInt(cropBox.style.top);
        const cropWidth = parseInt(cropBox.style.width);
        const cropHeight = parseInt(cropBox.style.height);

        imageData.cropX = cropLeft * scaleX;
        imageData.cropY = cropTop * scaleY;
        imageData.cropWidth = cropWidth * scaleX;
        imageData.cropHeight = cropHeight * scaleY;

        // Create canvas to perform crop
        const canvas = document.createElement('canvas');
        canvas.width = imageData.cropWidth;
        canvas.height = imageData.cropHeight;
        const ctx = canvas.getContext('2d');

        // Draw cropped portion
        const tempImg = new Image();
        tempImg.onload = () => {
            ctx.drawImage(
                tempImg,
                imageData.cropX,
                imageData.cropY,
                imageData.cropWidth,
                imageData.cropHeight,
                0,
                0,
                imageData.cropWidth,
                imageData.cropHeight
            );

            // Compress the cropped image
            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            console.log('Cropped image size:', (croppedDataUrl.length / 1024).toFixed(2) + ' KB');

            // Update image source
            img.src = croppedDataUrl;
            imageData.src = croppedDataUrl;
            imageData.naturalWidth = imageData.cropWidth;
            imageData.naturalHeight = imageData.cropHeight;
            imageData.cropX = 0;
            imageData.cropY = 0;

            this.cancelCrop();
            this.saveToLocalStorage();
            this.showNotification('Afbeelding bijgesneden', '', 'success');
        };
        tempImg.src = imageData.src;
    }

    cancelCrop() {
        const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
        wrapper.classList.remove('cropping');

        const overlay = wrapper.querySelector('.crop-overlay');
        const buttons = wrapper.querySelector('.crop-buttons');

        if (overlay) overlay.remove();
        if (buttons) buttons.remove();

        this.isCropping = false;
        this.cropData = null;
    }

    async deleteImage() {
        if (!this.selectedImage) return;

        const ok = await window.SummieDialogs.confirm('Weet je zeker dat je deze afbeelding wilt verwijderen?', {
            title: 'Afbeelding verwijderen',
            confirmText: 'Verwijderen',
            cancelText: 'Annuleren',
            danger: true
        });
        if (ok) {
            const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
            this.images.delete(this.selectedImage);
            this.selectedImage = null;
            wrapper.remove();
            this.saveToLocalStorage();
            this.showNotification('Afbeelding verwijderd', '', 'success');
        }
    }

    saveToLocalStorage() {
        // This will be called by the main save function
        if (window.saveToLocalStorage) {
            window.saveToLocalStorage();
        }
    }

    getImagesData() {
        const data = {};
        this.images.forEach((imageData, id) => {
            data[id] = imageData;
        });
        return data;
    }

    loadImagesData(imagesData) {
        if (!imagesData) return;

        this.images.clear();

        Object.values(imagesData).forEach(imageData => {
            this.images.set(imageData.id, imageData);
        });
    }

    restoreImagesInEditor() {
        const editor = document.getElementById('editor');
        if (!editor) {
            console.error('Editor not found');
            return;
        }

        const imageWrappers = editor.querySelectorAll('.editable-image-wrapper');

        imageWrappers.forEach(wrapper => {
            const imageId = wrapper.dataset.imageId;
            const imageData = this.images.get(imageId);

            if (imageData) {
                const img = wrapper.querySelector('img');

                if (!img) {
                    console.error('Image element not found in wrapper');
                    return;
                }

                // Restore the source (most important!)
                if (imageData.src) {
                    img.src = imageData.src;
                }

                // Restore dimensions
                imageData.originalWidth = imageData.originalWidth || imageData.width || imageData.naturalWidth || img.naturalWidth || img.offsetWidth;
                imageData.originalHeight = imageData.originalHeight || imageData.height || imageData.naturalHeight || img.naturalHeight || img.offsetHeight;
                if (imageData.width) {
                    img.style.width = imageData.width + 'px';
                }
                if (imageData.height) {
                    img.style.height = imageData.height + 'px';
                }

                wrapper.dataset.layout = imageData.layout || wrapper.dataset.layout || 'inline';
                if (imageData.align) wrapper.dataset.align = imageData.align;
                this.setImageLayoutForWrapper(wrapper, imageData);

                // Remove existing click handler if any to avoid duplicates
                if (wrapper._clickHandler) {
                    wrapper.removeEventListener('click', wrapper._clickHandler);
                }

                // Setup click handler
                const handler = (e) => {
                    e.stopPropagation();
                    this.selectImage(imageId);
                };
                wrapper.addEventListener('click', handler);
                wrapper._clickHandler = handler;

                if (wrapper._dragHandlerReady !== true) {
                    this.setupImageDrag(wrapper, imageId);
                    wrapper._dragHandlerReady = true;
                }

                // Remove existing toolbar if any
                const existingToolbar = wrapper.querySelector('.image-toolbar');
                if (existingToolbar) {
                    existingToolbar.remove();
                }

                // Add fresh toolbar
                const toolbar = this.createImageToolbar();
                wrapper.insertBefore(toolbar, wrapper.firstChild);

                // Remove all existing resize handles
                const existingHandles = wrapper.querySelectorAll('.resize-handle');
                existingHandles.forEach(h => h.remove());

                // Add all 8 fresh handles with proper event listeners
                const handles = this.createResizeHandles(imageId);
                handles.forEach(handle => wrapper.appendChild(handle));
            }
        });
    }

    setImageLayoutForWrapper(wrapper, imageData) {
        const layout = imageData.layout || wrapper.dataset.layout || 'inline';
        wrapper.classList.remove(
            'image-layout-inline',
            'image-layout-square',
            'image-layout-top-bottom',
            'image-layout-floating',
            'image-layout-front',
            'image-layout-behind',
            'image-align-left',
            'image-align-right'
        );
        wrapper.dataset.layout = layout;

        if (layout === 'square') {
            const align = imageData.align || wrapper.dataset.align || 'left';
            wrapper.dataset.align = align;
            wrapper.classList.add('image-layout-square', align === 'right' ? 'image-align-right' : 'image-align-left');
        } else if (layout === 'top-bottom') {
            wrapper.classList.add('image-layout-top-bottom');
        } else if (layout === 'floating' || layout === 'front' || layout === 'behind') {
            const className = layout === 'front'
                ? 'image-layout-front'
                : layout === 'behind'
                    ? 'image-layout-behind'
                    : 'image-layout-floating';
            wrapper.classList.add(className);
            wrapper.style.left = (imageData.x || 0) + 'px';
            wrapper.style.top = (imageData.y || 0) + 'px';
            wrapper.style.zIndex = layout === 'behind' ? '1' : layout === 'front' ? '30' : '12';
        } else {
            wrapper.classList.add('image-layout-inline');
        }
    }

    showNotification(title, message, type) {
        if (window.showNotification) {
            window.showNotification(title, message, type);
        }
    }

    getCropIcon() {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/>
            <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>
        </svg>`;
    }

    getDeleteIcon() {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            <line x1="10" y1="11" x2="10" y2="17"/>
            <line x1="14" y1="11" x2="14" y2="17"/>
        </svg>`;
    }
}

// Initialize image manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.imageManager = new ImageManager();
});
