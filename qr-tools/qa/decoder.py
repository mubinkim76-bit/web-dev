"""Independent decoder using an already provisioned libzbar; no installation."""
import ctypes as c
def decode(image):
 lib=c.CDLL('libzbar.so.0')
 signatures=[('zbar_image_scanner_create',c.c_void_p,[]),('zbar_image_create',c.c_void_p,[]),('zbar_image_scanner_set_config',c.c_int,[c.c_void_p,c.c_int,c.c_int,c.c_int]),('zbar_image_set_format',None,[c.c_void_p,c.c_ulong]),('zbar_image_set_size',None,[c.c_void_p,c.c_uint,c.c_uint]),('zbar_image_set_data',None,[c.c_void_p,c.c_void_p,c.c_ulong,c.c_void_p]),('zbar_scan_image',c.c_int,[c.c_void_p,c.c_void_p]),('zbar_image_first_symbol',c.c_void_p,[c.c_void_p]),('zbar_symbol_get_data',c.c_char_p,[c.c_void_p]),('zbar_image_destroy',None,[c.c_void_p]),('zbar_image_scanner_destroy',None,[c.c_void_p])]
 for name,restype,argtypes in signatures:
  fn=getattr(lib,name);fn.restype=restype;fn.argtypes=argtypes
 image=image.convert('L');raw=image.tobytes();buffer=c.create_string_buffer(raw);scanner=lib.zbar_image_scanner_create();handle=lib.zbar_image_create()
 try:
  lib.zbar_image_scanner_set_config(scanner,0,0,1);lib.zbar_image_set_format(handle,int.from_bytes(b'Y800','little'));lib.zbar_image_set_size(handle,*image.size);lib.zbar_image_set_data(handle,buffer,len(raw),None)
  count=lib.zbar_scan_image(scanner,handle)
  return [lib.zbar_symbol_get_data(lib.zbar_image_first_symbol(handle)).decode()] if count==1 else []
 finally:lib.zbar_image_destroy(handle);lib.zbar_image_scanner_destroy(scanner)
