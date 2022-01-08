const puppeteer = require('puppeteer');
const fs = require('fs');

const MAX_WIDTH = 1280;
const MAX_HEIGHT = 1400;

/*
Render given urls
@param URL to render
@param output path
*/

const RenderUrl = (url, output_path) => {

	const saveDomTree = (dom_tree_path, dom_tree) => {
		const dom_content = JSON.stringify(dom_tree);
		fs.writeFile(dom_tree_path, dom_content, (err) => {
			if(err) {
				return console.log(err);
			}
		});
	};

	const getImagePath = (output_path) => {
		return output_path + "/screenshot.png"
	};

	const getDOMPath = (output_path) => {
		return output_path + "/dom.json"
	};

	// returns DOM tree root with all its descendents
	// each node includes additional useful information - such as position, etc.
	const getDOMTree = () => {
		const selected_style_props = ['display', 'visibility', 'opacity', 'z-index', 'background-image', 'content', 'image'];

		//-- get elements in processing order
		const getElements = () => {
			let tree_stack = [];
			let result_stack = [];

			tree_stack.push(document);
			// if we have some other nodes
			while (tree_stack.length !== 0) {
				// get element
				let element = tree_stack.pop();
				// put it in result stack
				result_stack.push(element);
				//add children of element to stack
				for (let i = 0; i < element.childNodes.length; i++) {
					tree_stack.push(element.childNodes[i])
				}
			}
			return result_stack
		};

		//-- creates node with all information
		const createNode = (element) => {
			let node = {
				name: element.name,
				type: element.nodeType
			};

			//VALUE
			if (element.nodeValue) {
				node.value = element.nodeValue;
			}

			//COMPUTED STYLE
			let computed_style = typeof(element) == "Element" ? window.getComputedStyle(element) : null;
			if (computed_style) {
				node.computed_style = {};
				for (let i = 0; i < selected_style_props.length; i++) {
					let style_prop = selected_style_props[i];
					node.computed_style[style_prop] = computed_style[style_prop]
				}
			}

			let boundingClientRect = null;

			//POSITION
			try {
				// IT HAS BOUNDINGCLIENTRECT
				if (typeof element.getBoundingClientRect === 'function') {
					boundingClientRect = element.getBoundingClientRect();

					node.position = [
						Math.round(boundingClientRect.left),
						Math.round(boundingClientRect.top),
						Math.round(boundingClientRect.right),
						Math.round(boundingClientRect.bottom)
					]
				}
				// TRY TO COMPUTE IT
				else {
					const range = document.createRange();
					range.selectNodeContents(element);
					boundingClientRect = range.getBoundingClientRect();

					if (boundingClientRect) {

						node.position = [
							Math.round(boundingClientRect.left),
							Math.round(boundingClientRect.top),
							Math.round(boundingClientRect.right),
							Math.round(boundingClientRect.bottom)
						]
					}
				}
			}
			catch (err) {}

			let attributes = element.attributes;
			if (attributes) {
				node.attrs = {};
				for (let i = 0; i < attributes.length; i++) {
					node.attrs[attributes[i].nodeName] = attributes[i].nodeValue
				}
			}
			return node
		};

		//---------- RUN -----------//
		let element_stack = getElements();
		let processed_stack = [];

		while (element_stack.length !== 0) {
			let element = element_stack.pop();
			let node = createNode(element);

			// add children
			if (element.childNodes.length > 0) {
				node.childNodes = [];
				for (let i = 0; i < element.childNodes.length; i++) {
					let childNode = processed_stack.pop();
					node.childNodes.unshift(childNode);
				}
			}
			// add result to stack
			processed_stack.push(node)
			//console.log(processed_stack.length)
		}
		return processed_stack.pop()
	};

	const asyncTimeout = (ms) => {
		return new Promise(resolve => setTimeout(resolve, ms));
	};

	(async () => {
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		await page.setViewport({
			width: MAX_WIDTH,
			height: MAX_HEIGHT
		});

		let image_path = getImagePath(output_path);
		let dom_tree_path = getDOMPath(output_path);

		await page.goto(url);

		await asyncTimeout(2000);

		let dom_tree = await page.evaluate(getDOMTree);

		// before rendering
		// add white background in order to override black jpeg default
		await page.evaluate(function () {
			const style = document.createElement('style');
			const text = document.createTextNode('body { background: #ffffff }');

			style.setAttribute('type', 'text/css');
			style.appendChild(text);

			document.head.insertBefore(style, document.head.firstChild);
		});

		await page.screenshot({path: `${image_path}`});

		// save DOM tree
		saveDomTree(dom_tree_path, dom_tree);

		await browser.close();
	})();
};

// --- READ PARAMS --- //
if (process.argv.length === 4) {
	let url = process.argv[2];
	let output_path = process.argv[3];

	RenderUrl(url, output_path);
} else {
	console.log("Usage: download_page.js URL OUTPUT_PATH");
}

