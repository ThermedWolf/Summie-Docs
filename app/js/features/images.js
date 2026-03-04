// ==================== IMAGE MANIPULATION ====================

class ImageManager {
    constructor() {
        this.images = new Map(); // Store image data by ID
        this.selectedImage = null;
        this.isDragging = false;
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

        // Click outside to deselect images
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.editable-image-wrapper') && !e.target.closest('.image-toolbar')) {
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
        const imageId = 'img_' + Date.now();

        // Create image wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'editable-image-wrapper';
        wrapper.dataset.imageId = imageId;
        wrapper.contentEditable = 'false'; // Make the wrapper non-editable but moveable

        // Create image
        const img = document.createElement('img');
        img.src = src;
        img.alt = fileName;

        // Create toolbar
        const toolbar = this.createImageToolbar();

        // Create resize handles
        const handles = this.createResizeHandles();

        wrapper.appendChild(toolbar);
        wrapper.appendChild(img);
        handles.forEach(handle => wrapper.appendChild(handle));

        // Insert at cursor or end
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);

            // Create a new paragraph after the image for easier editing
            const br = document.createElement('br');

            range.insertNode(wrapper);
            range.collapse(false);
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            editor.appendChild(wrapper);
            editor.appendChild(document.createElement('br'));
        }

        // Store image data
        this.images.set(imageId, {
            id: imageId,
            src: src,
            fileName: fileName,
            isExternalUrl: isExternalUrl,
            width: null, // Will be set after load
            height: null,
            naturalWidth: null,
            naturalHeight: null,
            x: 0,
            y: 0,
            cropX: 0,
            cropY: 0,
            cropWidth: null,
            cropHeight: null
        });

        // Wait for image to load to get dimensions
        img.onload = () => {
            const imageData = this.images.get(imageId);
            imageData.naturalWidth = img.naturalWidth;
            imageData.naturalHeight = img.naturalHeight;
            imageData.width = img.offsetWidth;
            imageData.height = img.offsetHeight;
            imageData.cropWidth = img.naturalWidth;
            imageData.cropHeight = img.naturalHeight;
        };

        // Setup click handler
        wrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectImage(imageId);
        });

        this.selectImage(imageId);
        this.saveToLocalStorage();
        this.showNotification('Afbeelding toegevoegd', 'Tip: Versleep de afbeelding om te verplaatsen, of gebruik Ctrl+X en Ctrl+V', 'success');
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

    createResizeHandles() {
        const positions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        return positions.map(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos}`;
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.startResize(e, pos);
            });
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

        this.isResizing = true;
        this.resizeHandle = handle;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        const wrapper = document.querySelector(`[data-image-id="${this.selectedImage}"]`);
        const img = wrapper.querySelector('img');
        this.resizeStartWidth = img.offsetWidth;
        this.resizeStartHeight = img.offsetHeight;

        const imageData = this.images.get(this.selectedImage);
        this.aspectRatio = imageData.naturalWidth / imageData.naturalHeight;

        e.preventDefault();
    }

    handleMouseMove(e) {
        if (this.isResizing && this.selectedImage) {
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

    handleMouseUp(e) {
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
            }
        }

        // Always clear all states
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;

        // Clear crop data states
        if (this.cropData) {
            this.cropData.isDragging = false;
            this.cropData.isResizing = false;
        }
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

    deleteImage() {
        if (!this.selectedImage) return;

        if (confirm('Weet je zeker dat je deze afbeelding wilt verwijderen?')) {
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
                if (imageData.width) {
                    img.style.width = imageData.width + 'px';
                }
                if (imageData.height) {
                    img.style.height = imageData.height + 'px';
                }

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
                const handles = this.createResizeHandles();
                handles.forEach(handle => wrapper.appendChild(handle));
            }
        });
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