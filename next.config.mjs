/** @type {import('next').NextConfig} */
const nextConfig = {
	async rewrites() {
		return {
			beforeFiles: [
				{
					source: "/",
					destination: "/index.html",
				},
			],
			afterFiles: [],
			fallback: [],
		};
	},
};

export default nextConfig;
