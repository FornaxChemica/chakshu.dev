/** @type {import('next').NextConfig} */
const nextConfig = {
	async rewrites() {
		return {
			beforeFiles: [
				{
					source: "/music",
					destination: "/music/index.html",
				},
			],
		};
	},
};

export default nextConfig;
